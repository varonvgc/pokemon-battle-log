/**
 * pawmi_worker.js — テンプレートマッチング専用 Web Worker
 * OpenCV.js を利用して、メインスレッドをブロックせずにマッチングを行う。
 */
importScripts("../assets/poke_opencv/opencv.js");

let templMatCache = new Map();

/**
 * Worker 内で Base64 / Blob から ImageData を復元
 */
async function decodeBase64ToImageData(base64) {
  const dataUrl = base64.startsWith("data:")
    ? base64
    : "data:image/png;base64," + base64;
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0);
    return ctx.getImageData(0, 0, bmp.width, bmp.height);
  } finally {
    bmp.close();
  }
}

function imageToMatFromImageData(imageData) {
  const mat = cv.matFromImageData(imageData);
  if (!mat) {
    throw new Error("cv.matFromImageData returned null/undefined");
  }
  if (typeof mat.empty !== "function") {
    throw new Error("Mat object missing empty() method");
  }
  if (mat.empty()) {
    throw new Error("matFromImageData returned empty Mat");
  }
  return mat;
}

async function buildTemplCacheEntryForAlphaMask(templateBase64, alphaThreshold) {
  const imageData = await decodeBase64ToImageData(templateBase64);
  let templRaw = imageToMatFromImageData(imageData);
  if (!templRaw || templRaw.empty()) {
    throw new Error("Failed to convert template to Mat");
  }
  let templMat;
  let maskMat = null;
  if (templRaw.channels() === 4) {
    templMat = new cv.Mat();
    cv.cvtColor(templRaw, templMat, cv.COLOR_RGBA2BGR);
    maskMat = new cv.Mat();
    const mv = new cv.MatVector();
    cv.split(templRaw, mv);
    const a = mv.get(3);
    cv.threshold(a, maskMat, alphaThreshold, 255, cv.THRESH_BINARY);
    a.delete();
    for (let i = 0; i < 3; i++) {
      mv.get(i).delete();
    }
    mv.delete();
    templRaw.delete();
    if (cv.countNonZero(maskMat) < 16) {
      maskMat.delete();
      maskMat = null;
    }
  } else {
    templMat = templRaw;
  }
  return { templMat, maskMat };
}

async function processImages(imageBase64, templateBase64, callback, options = {}) {
  let imgMat = null;
  let result = null;

  try {
    const useAlphaMask = options.useAlphaMask === true;
    const alphaThreshold =
      typeof options.alphaThreshold === "number" ? options.alphaThreshold : 8;
    const cacheKey =
      templateBase64 + "|" + (useAlphaMask ? `am:${alphaThreshold}` : "nm");

    const imgImageData = await decodeBase64ToImageData(imageBase64);
    imgMat = imageToMatFromImageData(imgImageData);

    let templMat = null;
    let maskMat = null;

    let cached = templMatCache.get(cacheKey);
    if (!cached) {
      if (useAlphaMask) {
        cached = await buildTemplCacheEntryForAlphaMask(
          templateBase64,
          alphaThreshold
        );
      } else {
        const templData = await decodeBase64ToImageData(templateBase64);
        templMat = imageToMatFromImageData(templData);
        cached = { templMat, maskMat: null };
      }
      templMatCache.set(cacheKey, cached);
    }
    templMat = cached.templMat;
    maskMat = cached.maskMat;

    if (!imgMat || !templMat || imgMat.empty() || templMat.empty()) {
      throw new Error("Failed to convert image to Mat");
    }

    if (!imgMat.cols || !imgMat.rows || !templMat.cols || !templMat.rows) {
      throw new Error("Invalid Mat dimensions");
    }

    let maxVal;

    if (useAlphaMask) {
      if (imgMat.channels() === 4) {
        const bgr = new cv.Mat();
        cv.cvtColor(imgMat, bgr, cv.COLOR_RGBA2BGR);
        imgMat.delete();
        imgMat = bgr;
      } else if (imgMat.channels() === 1) {
        const bgr = new cv.Mat();
        cv.cvtColor(imgMat, bgr, cv.COLOR_GRAY2BGR);
        imgMat.delete();
        imgMat = bgr;
      }
      if (imgMat.cols < templMat.cols || imgMat.rows < templMat.rows) {
        throw new Error("Template is larger than source image");
      }
      result = new cv.Mat();
      if (maskMat && !maskMat.empty() && cv.countNonZero(maskMat) >= 16) {
        try {
          cv.matchTemplate(
            imgMat,
            templMat,
            result,
            cv.TM_CCOEFF_NORMED,
            maskMat
          );
        } catch (maskErr) {
          cv.matchTemplate(imgMat, templMat, result, cv.TM_CCOEFF_NORMED);
        }
      } else {
        cv.matchTemplate(imgMat, templMat, result, cv.TM_CCOEFF_NORMED);
      }
      maxVal = cv.minMaxLoc(result).maxVal;
    } else if (options.colorPriority) {
      let imgHSV = null;
      let templHSV = null;
      let imgChannels = null;
      let templChannels = null;
      let hueResult = null;
      let hueResult2 = null;
      let imgHueShifted = null;
      let templHueShifted = null;
      let saturationResult = null;
      let valueResult = null;
      try {
        imgHSV = new cv.Mat();
        templHSV = new cv.Mat();
        try {
          cv.cvtColor(imgMat, imgHSV, cv.COLOR_RGBA2RGB);
          cv.cvtColor(imgHSV, imgHSV, cv.COLOR_RGB2HSV);
          cv.cvtColor(templMat, templHSV, cv.COLOR_RGBA2RGB);
          cv.cvtColor(templHSV, templHSV, cv.COLOR_RGB2HSV);
        } catch (e) {
          cv.cvtColor(imgMat, imgHSV, cv.COLOR_RGB2HSV);
          cv.cvtColor(templMat, templHSV, cv.COLOR_RGB2HSV);
        }
        imgChannels = new cv.MatVector();
        templChannels = new cv.MatVector();
        cv.split(imgHSV, imgChannels);
        cv.split(templHSV, templChannels);
        hueResult = new cv.Mat();
        cv.matchTemplate(
          imgChannels.get(0),
          templChannels.get(0),
          hueResult,
          cv.TM_CCOEFF_NORMED
        );
        let hueScore = cv.minMaxLoc(hueResult).maxVal;
        hueResult2 = new cv.Mat();
        imgHueShifted = new cv.Mat();
        templHueShifted = new cv.Mat();
        const imgHueCh = imgChannels.get(0);
        const templHueCh = templChannels.get(0);
        const onesImg = new cv.Mat.ones(
          imgHueCh.rows,
          imgHueCh.cols,
          cv.CV_8U
        );
        const onesTempl = new cv.Mat.ones(
          templHueCh.rows,
          templHueCh.cols,
          cv.CV_8U
        );
        const addMaskImg = new cv.Mat();
        const addMaskTempl = new cv.Mat();
        try {
          cv.add(imgHueCh, onesImg, imgHueShifted, addMaskImg, -1);
          cv.add(
            templHueCh,
            onesTempl,
            templHueShifted,
            addMaskTempl,
            -1
          );
          cv.matchTemplate(
            imgHueShifted,
            templHueShifted,
            hueResult2,
            cv.TM_CCOEFF_NORMED
          );
          let hueScore2 = cv.minMaxLoc(hueResult2).maxVal;
          hueScore = Math.max(hueScore, hueScore2);
        } finally {
          onesImg.delete();
          onesTempl.delete();
          addMaskImg.delete();
          addMaskTempl.delete();
        }
        saturationResult = new cv.Mat();
        cv.matchTemplate(
          imgChannels.get(1),
          templChannels.get(1),
          saturationResult,
          cv.TM_CCOEFF_NORMED
        );
        let saturationScore = cv.minMaxLoc(saturationResult).maxVal;
        valueResult = new cv.Mat();
        cv.matchTemplate(
          imgChannels.get(2),
          templChannels.get(2),
          valueResult,
          cv.TM_CCOEFF_NORMED
        );
        let valueScore = cv.minMaxLoc(valueResult).maxVal;
        maxVal = 0.7 * hueScore + 0.2 * saturationScore + 0.1 * valueScore;
      } finally {
        if (hueResult) hueResult.delete();
        if (hueResult2) hueResult2.delete();
        if (saturationResult) saturationResult.delete();
        if (valueResult) valueResult.delete();
        if (imgChannels) imgChannels.delete();
        if (templChannels) templChannels.delete();
        if (imgHSV) imgHSV.delete();
        if (templHSV) templHSV.delete();
        if (imgHueShifted) imgHueShifted.delete();
        if (templHueShifted) templHueShifted.delete();
      }
    } else {
      if (imgMat.cols < templMat.cols || imgMat.rows < templMat.rows) {
        throw new Error("Template is larger than source image");
      }
      result = new cv.Mat();
      cv.matchTemplate(imgMat, templMat, result, cv.TM_CCOEFF_NORMED);
      let minMax = cv.minMaxLoc(result);
      maxVal = minMax.maxVal;
    }

    if (typeof callback === "function") {
      callback(null, maxVal);
    }
  } catch (error) {
    console.error("Error in processImages:", error);
    if (typeof callback === "function") {
      callback(error, null);
    }
  } finally {
    if (imgMat) imgMat.delete();
    if (result) result.delete();
  }
}

let openCvReadyPromise = null;

function isOpenCvRuntimeReady() {
  return (
    typeof cv !== "undefined" &&
    cv.Mat &&
    cv.matFromImageData &&
    cv.cvtColor &&
    cv.matchTemplate
  );
}

function ensureOpenCvReady() {
  if (isOpenCvRuntimeReady()) {
    return Promise.resolve();
  }
  if (!openCvReadyPromise) {
    openCvReadyPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        openCvReadyPromise = null;
        reject(new Error("OpenCV initialization timeout"));
      }, 60000);

      const checkOpenCV = () => {
        if (isOpenCvRuntimeReady()) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkOpenCV, 50);
        }
      };
      checkOpenCV();
    });
  }
  return openCvReadyPromise;
}

const jobQueue = [];
let jobProcessing = false;

async function processOneJob(payload) {
  const { id, imageBase64, templateBase64, options } = payload;
  try {
    await ensureOpenCvReady();
    await new Promise((resolve) => {
      processImages(imageBase64, templateBase64, (err, maxVal) => {
        if (err != null) {
          self.postMessage({
            id: id,
            ok: false,
            error: typeof err.message === "string" ? err.message : String(err),
          });
        } else {
          self.postMessage({ id: id, ok: true, maxVal: maxVal });
        }
        resolve();
      }, options || {});
    });
  } catch (e) {
    self.postMessage({
      id: id,
      ok: false,
      error: e.message || String(e),
    });
  }
}

async function drainQueue() {
  if (jobProcessing) return;
  jobProcessing = true;
  try {
    while (jobQueue.length > 0) {
      const job = jobQueue.shift();
      await processOneJob(job);
    }
  } finally {
    jobProcessing = false;
    if (jobQueue.length > 0) {
      drainQueue();
    }
  }
}

self.onmessage = function (e) {
  jobQueue.push(e.data);
  drainQueue();
};
