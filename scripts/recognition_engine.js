// ============================================================================
// Pokemon Battle Log - Universal Client-Side Image Recognition Engine
// Powered by Otsu Thresholding, 680-dim Spatial Pyramid PHOG & Geometric Solidity
// Standard Coordinate Space: 2532 x 1170
// ============================================================================

class PokemonRecognitionEngine {
  constructor() {
    this.isLoaded = false;
    this.roster = [];
    this.geoFeatures = {};
    this.typeFeaturesAfter = {};
    this.typeFeaturesBefore = {};
    this.badgeFeatures = {};
  }

  async loadDictionaries() {
    if (this.isLoaded) return true;
    try {
      const [rosterRes, geoRes, typeAfterRes, typeBeforeRes, badgeRes] = await Promise.all([
        fetch('assets/clean_roster.json'),
        fetch('assets/pokemon_geo_phog_features.json'),
        fetch('assets/type_features.json'),
        fetch('assets/type_features_before.json'),
        fetch('assets/badge_features.json')
      ]);

      this.roster = await rosterRes.json();
      const rawGeo = await geoRes.json();
      const rawTypeAfter = await typeAfterRes.json();
      const rawTypeBefore = await typeBeforeRes.json();
      const rawBadge = await badgeRes.json();

      // Decode Base64 features to Uint8Array / Float64Array
      this.geoFeatures = {};
      for (const [key, val] of Object.entries(rawGeo)) {
        this.geoFeatures[key] = {
          phog: this._base64ToUint8(val.phog),
          extent: Number(val.extent),
          aspectRatio: Number(val.aspectRatio),
          areaRatio: Number(val.areaRatio)
        };
      }

      this.typeFeaturesAfter = {};
      for (const [key, val] of Object.entries(rawTypeAfter)) {
        if (key !== 'stellar' && key !== 'none') {
          this.typeFeaturesAfter[key] = this._base64ToUint8(val);
        }
      }

      this.typeFeaturesBefore = {};
      for (const [key, val] of Object.entries(rawTypeBefore)) {
        if (key !== 'stellar' && key !== 'none') {
          this.typeFeaturesBefore[key] = this._base64ToUint8(val);
        }
      }

      this.badgeFeatures = {};
      for (const [key, val] of Object.entries(rawBadge)) {
        this.badgeFeatures[key] = this._base64ToUint8(val);
      }

      this.isLoaded = true;
      console.log('Pokemon Recognition Engine Dictionaries Loaded successfully!');
      return true;
    } catch (e) {
      console.error('Failed to load recognition dictionaries:', e);
      return false;
    }
  }

  _base64ToUint8(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  _normalizePokeName(name) {
    if (!name) return "";
    return name.split('(')[0].split('（')[0].trim();
  }

  _matchTypeTemplate(ctx, x, y, w, h, dict) {
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = 20;
    cropCanvas.height = 20;
    const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
    cropCtx.imageSmoothingEnabled = true;
    cropCtx.imageSmoothingQuality = 'high';
    cropCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, 20, 20);

    const imgData = cropCtx.getImageData(0, 0, 20, 20).data;
    let rSum = 0, gSum = 0, bSum = 0;
    for (let i = 0; i < 1600; i += 4) {
      rSum += imgData[i];
      gSum += imgData[i + 1];
      bSum += imgData[i + 2];
    }
    const meanR = rSum / 400.0;
    const meanG = gSum / 400.0;
    const meanB = bSum / 400.0;

    let bestType = 'none';
    let bestScore = 999999999.0;

    for (const [tName, tb] of Object.entries(dict)) {
      let diff = 0.0;
      let tbR = 0, tbG = 0, tbB = 0;
      const isRgb = (tb.length === 1200);

      for (let p = 0; p < 400; p++) {
        const k = p * 4;   // RGBA stride in imgData
        const t = isRgb ? (p * 3) : (p * 4);   // RGB or RGBA stride in tb
        const dr = imgData[k] - tb[t];
        const dg = imgData[k + 1] - tb[t + 1];
        const db = imgData[k + 2] - tb[t + 2];
        diff += (dr * dr + dg * dg + db * db);
        tbR += tb[t];
        tbG += tb[t + 1];
        tbB += tb[t + 2];
      }
      const tbMeanR = tbR / 400.0;
      const tbMeanG = tbG / 400.0;
      const tbMeanB = tbB / 400.0;
      const dmr = meanR - tbMeanR;
      const dmg = meanG - tbMeanG;
      const dmb = meanB - tbMeanB;
      const meanDiff = (dmr * dmr + dmg * dmg + dmb * dmb);

      const totalScore = diff + (100.0 * meanDiff);

      if (totalScore < bestScore) {
        bestScore = totalScore;
        bestType = tName;
      }
    }
    return { type: bestType, score: bestScore };
  }

  _computeOtsuThreshold(diffArray) {
    const hist = new Int32Array(256);
    const total = diffArray.length;
    if (total === 0) return 35;

    for (let i = 0; i < total; i++) {
      const bin = Math.min(255, Math.max(0, Math.floor(diffArray[i])));
      hist[bin]++;
    }

    let sum = 0.0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];

    let sumB = 0.0;
    let wB = 0;
    let varMax = 0.0;
    let threshold = 35;

    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;

      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const varBetween = wB * wF * (mB - mF) * (mB - mF);
      if (varBetween > varMax) {
        varMax = varBetween;
        threshold = t;
      }
    }
    return Math.max(20, threshold);
  }

  _computePHOG680(gray, mask) {
    const gx = new Float64Array(32 * 32);
    const gy = new Float64Array(32 * 32);
    const mag = new Float64Array(32 * 32);
    const ori = new Float64Array(32 * 32);

    for (let y = 1; y < 31; y++) {
      for (let x = 1; x < 31; x++) {
        const idx = y * 32 + x;
        const dx = gray[idx + 1] - gray[idx - 1];
        const dy = gray[idx + 32] - gray[idx - 32];
        const mdx = (mask[idx + 1] - mask[idx - 1]) * 0.5;
        const mdy = (mask[idx + 32] - mask[idx - 32]) * 0.5;
        const totDx = dx + mdx;
        const totDy = dy + mdy;
        const m = Math.sqrt(totDx * totDx + totDy * totDy);
        let ang = Math.atan2(totDy, totDx);
        if (ang < 0) ang += Math.PI;
        mag[idx] = m;
        ori[idx] = ang;
      }
    }

    const binSize = Math.PI / 8.0;
    const phog = new Float64Array(680);
    let offset = 0;

    const gridSizes = [1, 2, 4, 8];
    for (const gridSize of gridSizes) {
      const cellPixels = 32 / gridSize;
      for (let cy = 0; cy < gridSize; cy++) {
        for (let cx = 0; cx < gridSize; cx++) {
          const cellIdx = offset + (cy * gridSize + cx) * 8;
          const startX = Math.floor(cx * cellPixels);
          const endX = Math.floor((cx + 1) * cellPixels);
          const startY = Math.floor(cy * cellPixels);
          const endY = Math.floor((cy + 1) * cellPixels);

          for (let py = startY; py < endY; py++) {
            for (let px = startX; px < endX; px++) {
              const idx = py * 32 + px;
              const m = mag[idx];
              if (m > 0) {
                const b = Math.min(7, Math.floor(ori[idx] / binSize));
                phog[cellIdx + b] += m;
              }
            }
          }
        }
      }
      offset += (gridSize * gridSize * 8);
    }

    let normSum = 0.0;
    for (let k = 0; k < 680; k++) normSum += phog[k] * phog[k];
    const norm = Math.sqrt(normSum) + 0.000001;

    const phogBytes = new Uint8Array(680);
    for (let k = 0; k < 680; k++) {
      phogBytes[k] = Math.min(255, Math.floor((phog[k] / norm) * 255.0));
    }
    return phogBytes;
  }

  _extractLiveGeoPHOG(ctx, x, y, w, h) {
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = w;
    cropCanvas.height = h;
    const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
    cropCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, w, h);

    const imgData = cropCtx.getImageData(0, 0, w, h).data;

    // Corner background sampling
    const getPixel = (cx, cy) => {
      const idx = (cy * w + cx) * 4;
      return [imgData[idx], imgData[idx + 1], imgData[idx + 2]];
    };

    const c1 = getPixel(3, 3);
    const c2 = getPixel(w - 4, 3);
    const c3 = getPixel(3, h - 4);
    const c4 = getPixel(w - 4, h - 4);

    const bgR = (c1[0] + c2[0] + c3[0] + c4[0]) / 4.0;
    const bgG = (c1[1] + c2[1] + c3[1] + c4[1]) / 4.0;
    const bgB = (c1[2] + c2[2] + c3[2] + c4[2]) / 4.0;

    const diffs = new Float64Array(w * h);
    let idx = 0;
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const pIdx = (cy * w + cx) * 4;
        const dr = imgData[pIdx] - bgR;
        const dg = imgData[pIdx + 1] - bgG;
        const db = imgData[pIdx + 2] - bgB;
        diffs[idx++] = Math.sqrt(dr * dr + dg * dg + db * db);
      }
    }

    const otsuT = this._computeOtsuThreshold(diffs);

    let minX = w, maxX = 0, minY = h, maxY = 0;
    let fgCount = 0;
    idx = 0;
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        if (diffs[idx++] >= otsuT) {
          fgCount++;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
        }
      }
    }

    if (fgCount === 0 || minX >= maxX || minY >= maxY) {
      minX = 0; maxX = w - 1; minY = 0; maxY = h - 1;
    }

    const bw = (maxX - minX) + 1;
    const bh = (maxY - minY) + 1;
    const boxArea = bw * bh;
    const liveExtent = boxArea > 0 ? (fgCount / boxArea) : 0.5;
    const liveAspect = bw / bh;

    // Normalize to 32x32 canvas
    const t32Canvas = document.createElement('canvas');
    t32Canvas.width = 32;
    t32Canvas.height = 32;
    const t32Ctx = t32Canvas.getContext('2d', { willReadFrequently: true });
    t32Ctx.imageSmoothingEnabled = true;
    t32Ctx.imageSmoothingQuality = 'high';

    const scale = Math.min(28.0 / bw, 28.0 / bh);
    const tw = Math.floor(bw * scale);
    const th = Math.floor(bh * scale);
    const tx = Math.floor((32 - tw) / 2);
    const ty = Math.floor((32 - th) / 2);

    t32Ctx.drawImage(cropCanvas, minX, minY, bw, bh, tx, ty, tw, th);
    const t32Data = t32Ctx.getImageData(0, 0, 32, 32).data;

    const mask = new Uint8Array(32 * 32);
    const gray = new Float64Array(32 * 32);
    let mass32 = 0;
    idx = 0;

    for (let cy = 0; cy < 32; cy++) {
      for (let cx = 0; cx < 32; cx++) {
        const pIdx = (cy * 32 + cx) * 4;
        const r = t32Data[pIdx];
        const g = t32Data[pIdx + 1];
        const b = t32Data[pIdx + 2];
        const dr = r - bgR;
        const dg = g - bgG;
        const db = b - bgB;
        const diff = Math.sqrt(dr * dr + dg * dg + db * db);
        const isFg = diff >= (otsuT * 0.75);

        mask[idx] = isFg ? 255 : 0;
        gray[idx] = (r * 0.299 + g * 0.587 + b * 0.114);
        if (isFg) mass32++;
        idx++;
      }
    }

    const livePhog = this._computePHOG680(gray, mask);
    return {
      phog: livePhog,
      extent: liveExtent,
      aspectRatio: liveAspect,
      areaRatio: (mass32 / 1024.0)
    };
  }

  _matchPokemonGeoPHOG(ctx, x, y, w, h, candidateEntries) {
    if (!candidateEntries || candidateEntries.length === 0) return '???';
    if (candidateEntries.length === 1) return candidateEntries[0].display;

    const live = this._extractLiveGeoPHOG(ctx, x, y, w, h);
    if (!live) return candidateEntries[0].display;

    // 候補数に応じた動的ペナルティ重み付け（解決策B）
    // 候補が少数（<= 4体）の場合はシルエット全体の幾何形状（extent, areaRatio, aspectRatio）を強化
    const numCandidates = candidateEntries.length;
    let weightAspect = 380.0;
    let weightExtent = 420.0;
    let weightArea = 250.0;

    if (numCandidates <= 4) {
      // 少数候補（リキキリン/アヤシシ/ヤレユータン等）: 隙間充填率(extent)とアスペクト比を強化
      weightAspect = 500.0;
      weightExtent = 850.0;
      weightArea = 250.0;
    } else if (numCandidates <= 8) {
      weightAspect = 450.0;
      weightExtent = 550.0;
      weightArea = 250.0;
    }

    let bestDisplay = '';
    let bestDist = 999999999.0;

    for (const entry of candidateEntries) {
      const ref = this.geoFeatures[entry.id];
      if (!ref) continue;

      let distPhog = 0.0;
      for (let k = 0; k < 680; k++) {
        distPhog += Math.abs(live.phog[k] - ref.phog[k]);
      }

      const aspectRatioDiff = Math.abs(live.aspectRatio - ref.aspectRatio);
      const extentDiff = Math.abs(live.extent - ref.extent);
      const areaDiff = Math.abs(live.areaRatio - ref.areaRatio);

      const totalDist = distPhog + (weightAspect * aspectRatioDiff) + (weightExtent * extentDiff) + (weightArea * areaDiff);

      if (totalDist < bestDist) {
        bestDist = totalDist;
        bestDisplay = entry.display;
      }
    }
    return bestDisplay || candidateEntries[0].display;
  }

  _getCandidates(t1, t2) {
    let c = [];
    if (t1 !== 'none' && t2 !== 'none') {
      c = this.roster.filter(r => (r.t1 === t1 && r.t2 === t2) || (r.t1 === t2 && r.t2 === t1));
    }
    if (c.length === 0 && (t1 !== 'none' || t2 !== 'none')) {
      const single = t1 !== 'none' ? t1 : t2;
      c = this.roster.filter(r => r.t1 === single && (!r.t2 || r.t2 === 'none'));
      if (c.length === 0) {
        c = this.roster.filter(r => r.t1 === single || r.t2 === single);
      }
    }
    if (c.length === 0) c = this.roster;
    return c;
  }

  _getSlotBadgeScores(ctx, slotY) {
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = 20;
    cropCanvas.height = 20;
    const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
    cropCtx.imageSmoothingEnabled = true;
    cropCtx.imageSmoothingQuality = 'high';
    cropCtx.drawImage(ctx.canvas, 505, slotY + 15, 70, 85, 0, 0, 20, 20);

    const imgData = cropCtx.getImageData(0, 0, 20, 20).data;
    const b = new Uint8Array(400);
    let whiteCount = 0;

    for (let cy = 0; cy < 20; cy++) {
      for (let cx = 0; cx < 20; cx++) {
        const idx = (cy * 20 + cx) * 4;
        const lum = imgData[idx] * 0.299 + imgData[idx + 1] * 0.587 + imgData[idx + 2] * 0.114;
        const isWhite = lum > 180;
        b[cy * 20 + cx] = isWhite ? 255 : 0;
        if (isWhite) whiteCount++;
      }
    }

    const scores = { 1: 999999, 2: 999999, 3: 999999, 4: 999999 };
    for (const numStr of ['1', '2', '3', '4']) {
      const ref = this.badgeFeatures[numStr];
      if (!ref) continue;
      let diff = 0;
      for (let k = 0; k < 400; k++) {
        diff += Math.abs(b[k] - ref[k]);
      }
      scores[parseInt(numStr, 10)] = diff;
    }

    return {
      isSelected: (whiteCount >= 150),
      whiteCount,
      scores
    };
  }

  _resolveMySelection(ctx, myTeamList) {
    const slot0Y = 160;
    const slotPitch = 137;

    const teamTypeInfo = myTeamList.map(pName => {
      const norm = this._normalizePokeName(pName);
      const matched = this.roster.find(r => r.display === pName || r.name === pName || this._normalizePokeName(r.name) === norm);
      return {
        name: pName,
        t1: matched ? matched.t1 : 'none',
        t2: matched ? matched.t2 : 'none'
      };
    });

    // 1. 各スロットのバッジ認識（1〜4の差分スコア取得）
    const slotBadges = [];
    for (let i = 0; i < 6; i++) {
      const sy = slot0Y + i * slotPitch;
      const badgeInfo = this._getSlotBadgeScores(ctx, sy);
      slotBadges.push({ slot: i, ...badgeInfo });
    }

    // 選出されたスロットを抽出（通常4つ、もし足りない場合は白画素数の多い順に補完）
    let selectedSlots = slotBadges.filter(s => s.isSelected);
    if (selectedSlots.length < 4) {
      const sortedByWhite = [...slotBadges].sort((a, b) => b.whiteCount - a.whiteCount);
      selectedSlots = sortedByWhite.slice(0, 4);
    } else if (selectedSlots.length > 4) {
      selectedSlots = selectedSlots.sort((a, b) => b.whiteCount - a.whiteCount).slice(0, 4);
    }

    // 2. 4つの選出スロットに対して [1, 2, 3, 4] の1対1最適割当（24通りの全順列コスト最小化）
    const permutations = [
      [1,2,3,4], [1,2,4,3], [1,3,2,4], [1,3,4,2], [1,4,2,3], [1,4,3,2],
      [2,1,3,4], [2,1,4,3], [2,3,1,4], [2,3,4,1], [2,4,1,3], [2,4,3,1],
      [3,1,2,4], [3,1,4,2], [3,2,1,4], [3,2,4,1], [3,4,1,2], [3,4,2,1],
      [4,1,2,3], [4,1,3,2], [4,2,1,3], [4,2,3,1], [4,3,1,2], [4,3,2,1]
    ];

    let bestTotalCost = Infinity;
    let bestPerm = [1, 2, 3, 4];

    for (const perm of permutations) {
      let cost = 0;
      for (let k = 0; k < 4; k++) {
        const num = perm[k];
        cost += selectedSlots[k].scores[num];
      }
      if (cost < bestTotalCost) {
        bestTotalCost = cost;
        bestPerm = perm;
      }
    }

    const selectedSlotIndices = {};
    for (let k = 0; k < 4; k++) {
      const sIdx = selectedSlots[k].slot;
      const num = bestPerm[k];
      selectedSlotIndices[num] = sIdx;
    }

    // 3. タイプ判定とチームメンバーの1対1最小コスト割当
    const slotTypes = [];
    for (let i = 0; i < 6; i++) {
      const sy = slot0Y + i * slotPitch;
      const res1 = this._matchTypeTemplate(ctx, 710, sy + 12, 45, 45, this.typeFeaturesAfter);
      const res2 = this._matchTypeTemplate(ctx, 765, sy + 12, 45, 45, this.typeFeaturesAfter);
      const t1 = res1.score < 12000000 ? res1.type : 'none';
      const t2 = res2.score < 12000000 ? res2.type : 'none';
      slotTypes.push({ index: i, t1, t2, res1, res2 });
    }

    const costMatrix = Array.from({ length: 6 }, () => new Float64Array(6));
    for (let s = 0; s < 6; s++) {
      const st = slotTypes[s];
      for (let t = 0; t < 6; t++) {
        const m = teamTypeInfo[t] || { t1: 'none', t2: 'none' };
        let cost = 1000.0;

        if (st.t1 !== 'none' && st.t2 !== 'none') {
          if ((m.t1 === st.t1 && m.t2 === st.t2) || (m.t1 === st.t2 && m.t2 === st.t1)) {
            cost = (st.res1.score + st.res2.score) / 1000000.0;
          } else if (m.t1 === st.t1 || m.t2 === st.t1 || m.t1 === st.t2 || m.t2 === st.t2) {
            cost = 50.0 + (st.res1.score / 1000000.0);
          }
        } else if (st.t2 !== 'none') {
          if (m.t1 === st.t2 && (!m.t2 || m.t2 === 'none')) {
            cost = st.res2.score / 1000000.0;
          } else if (m.t1 === st.t2 || m.t2 === st.t2) {
            cost = 60.0 + (st.res2.score / 1000000.0);
          }
        }
        costMatrix[s][t] = cost;
      }
    }

    const slotToTeam = {};
    const assignedTeams = new Set();
    for (let step = 0; step < 6; step++) {
      let minCost = 999999.0;
      let bestSlot = -1;
      let bestTeam = -1;
      for (let s = 0; s < 6; s++) {
        if (slotToTeam[s] !== undefined) continue;
        for (let t = 0; t < 6; t++) {
          if (assignedTeams.has(t)) continue;
          if (costMatrix[s][t] < minCost) {
            minCost = costMatrix[s][t];
            bestSlot = s;
            bestTeam = t;
          }
        }
      }
      if (bestSlot !== -1 && bestTeam !== -1) {
        slotToTeam[bestSlot] = bestTeam;
        assignedTeams.add(bestTeam);
      }
    }

    const resultSelection = { 1: '', 2: '', 3: '', 4: '' };
    for (const num of [1, 2, 3, 4]) {
      if (selectedSlotIndices[num] !== undefined) {
        const sIdx = selectedSlotIndices[num];
        const tIdx = slotToTeam[sIdx];
        if (tIdx !== undefined && myTeamList[tIdx]) {
          resultSelection[num] = myTeamList[tIdx];
        }
      }
    }
    return resultSelection;
  }

  async _extractTrainerName(sCtx, mode) {
    try {
      if (typeof Tesseract === 'undefined') {
        console.warn('Tesseract.js is not loaded. Skipping trainer name OCR.');
        return '';
      }

      // Crop coordinates (2532 x 1170 space)
      const cropX = (mode === 'BEFORE') ? 1800 : 1650;
      const cropY = (mode === 'BEFORE') ? 50 : 80;
      const cropW = (mode === 'BEFORE') ? 550 : 450;
      const cropH = (mode === 'BEFORE') ? 80 : 70;

      // Extract and binarize
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = cropW;
      tempCanvas.height = cropH;
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
      tempCtx.drawImage(sCtx.canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      const srcData = tempCtx.getImageData(0, 0, cropW, cropH).data;

      // Scale 2x for optimal OCR
      const ocrCanvas = document.createElement('canvas');
      ocrCanvas.width = cropW * 2;
      ocrCanvas.height = cropH * 2;
      const ocrCtx = ocrCanvas.getContext('2d');
      const outImgData = ocrCtx.createImageData(cropW * 2, cropH * 2);
      const outData = outImgData.data;

      for (let y = 0; y < cropH; y++) {
        for (let x = 0; x < cropW; x++) {
          const idx = (y * cropW + x) * 4;
          const r = srcData[idx], g = srcData[idx + 1], b = srcData[idx + 2];
          // Pure white text detection on pink background
          const isText = (r > 205 && g > 205 && b > 205) || (g > 165 && b > 165 && r > 180);
          const val = isText ? 0 : 255; // Text is black (0), Background is white (255)

          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const oIdx = ((y * 2 + dy) * (cropW * 2) + (x * 2 + dx)) * 4;
              outData[oIdx] = val;
              outData[oIdx + 1] = val;
              outData[oIdx + 2] = val;
              outData[oIdx + 3] = 255;
            }
          }
        }
      }
      ocrCtx.putImageData(outImgData, 0, 0);

      // Recognize multi-lingual text using Tesseract.js
      // Languages supported: Japanese, English, Chinese (Sim/Tra), Korean, Spanish, French, German, Italian
      const lang = 'jpn+eng+chi_sim+chi_tra+kor+spa+fra+deu+ita';
      const ocrRes = await Tesseract.recognize(ocrCanvas, lang, {
        logger: () => {}
      });

      let text = (ocrRes && ocrRes.data && ocrRes.data.text) ? ocrRes.data.text : '';
      text = text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
      return text;
    } catch (err) {
      console.warn('Trainer name OCR error:', err);
      return '';
    }
  }

  /**
   * Main Recognition Entrypoint for Image / Canvas
   * @param {HTMLImageElement | HTMLCanvasElement | ImageBitmap} imageSource
   * @param {Array<string>} [myTeam] Optional user registered 6-pokemon team for AFTER mode
   * @returns {Promise<{mode: 'BEFORE'|'AFTER', opponent: Array<string>, mySelection?: Array<string>, trainerName?: string}>}
   */
  async recognize(imageSource, myTeam = [], forcedMode = 'auto') {
    await this.loadDictionaries();

    // Standardize to Canvas (Exact 2532 x 1170 Coordinate Space)
    const standardCanvas = document.createElement('canvas');
    standardCanvas.width = 2532;
    standardCanvas.height = 1170;
    const sCtx = standardCanvas.getContext('2d', { willReadFrequently: true });
    sCtx.imageSmoothingEnabled = true;
    sCtx.imageSmoothingQuality = 'high';
    sCtx.drawImage(imageSource, 0, 0, 2532, 1170);

    // 1. Detect Mode: BEFORE (Selection screen) vs AFTER (Battle preparation screen)
    let detectedMode;
    if (forcedMode === 'not_selected' || forcedMode === 'BEFORE') {
      detectedMode = 'BEFORE';
    } else if (forcedMode === 'selected' || forcedMode === 'AFTER') {
      detectedMode = 'AFTER';
    } else {
      const testBefore = this._matchTypeTemplate(sCtx, 2117, 137 + 12, 45, 45, this.typeFeaturesBefore);
      const testAfter = this._matchTypeTemplate(sCtx, 1912, 160 + 12, 45, 45, this.typeFeaturesAfter);
      const isBefore = (testBefore.score < testAfter.score) || (testBefore.score < 10000000);
      detectedMode = isBefore ? 'BEFORE' : 'AFTER';
    }

    // OCR Trainer Name in parallel / background
    const trainerNamePromise = this._extractTrainerName(sCtx, detectedMode);

    if (detectedMode === 'BEFORE') {
      const slot0Y = 137;
      const slotPitch = 137;
      const iconX = 1955, iconW = 130, iconYOff = 5, iconH = 105;
      const t1X = 2117, t1YOff = 12, t2X = 2173, t2YOff = 12, tW = 45, tH = 45;

      const opponent = [];
      for (let i = 0; i < 6; i++) {
        const slotY = slot0Y + i * slotPitch;
        const res1 = this._matchTypeTemplate(sCtx, t1X, slotY + t1YOff, tW, tH, this.typeFeaturesBefore);
        const res2 = this._matchTypeTemplate(sCtx, t2X, slotY + t2YOff, tW, tH, this.typeFeaturesBefore);
        const t1 = res1.score < 8000000 ? res1.type : 'none';
        const t2 = res2.score < 8000000 ? res2.type : 'none';

        const candidates = this._getCandidates(t1, t2);
        const pName = this._matchPokemonGeoPHOG(sCtx, iconX, slotY + iconYOff, iconW, iconH, candidates);
        opponent.push(pName);
      }

      const trainerName = await trainerNamePromise;

      return {
        mode: 'BEFORE',
        opponent,
        trainerName
      };
    } else {
      // AFTER Mode
      const slot0Y = 160;
      const slotPitch = 137;
      const iconX = 1765, iconW = 115, iconYOff = 10, iconH = 95;
      const t1X = 1912, t1YOff = 12, t2X = 1970, t2YOff = 12, tW = 45, tH = 45;

      const opponent = [];
      for (let i = 0; i < 6; i++) {
        const slotY = slot0Y + i * slotPitch;
        const res1 = this._matchTypeTemplate(sCtx, t1X, slotY + t1YOff, tW, tH, this.typeFeaturesAfter);
        const res2 = this._matchTypeTemplate(sCtx, t2X, slotY + t2YOff, tW, tH, this.typeFeaturesAfter);
        const t1 = res1.score < 15000000 ? res1.type : 'none';
        const t2 = res2.score < 15000000 ? res2.type : 'none';

        const candidates = this._getCandidates(t1, t2);
        const pName = this._matchPokemonGeoPHOG(sCtx, iconX, slotY + iconYOff, iconW, iconH, candidates);
        opponent.push(pName);
      }

      // My Selection
      let mySelection = [];
      if (myTeam && myTeam.length > 0) {
        const selObj = this._resolveMySelection(sCtx, myTeam);
        mySelection = [selObj[1], selObj[2], selObj[3], selObj[4]];
      }

      const trainerName = await trainerNamePromise;

      return {
        mode: 'AFTER',
        opponent,
        mySelection,
        trainerName
      };
    }
  }
}

// Attach globally
window.PokemonRecognitionEngine = PokemonRecognitionEngine;
window.recognitionEngine = new PokemonRecognitionEngine();
