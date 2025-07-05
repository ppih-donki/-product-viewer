let allData = [];
let selectedStore = null;
let selectedFloor = null;
let selectedMapType = "map";
let selectedItems = []; // { shelf_id, jan, productName }

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("exportBtn").addEventListener("click", exportCSV);
  document.getElementById("clearAllBtn").addEventListener("click", () => {
    selectedItems = [];
    updateSelectionUI();
  });
  document.getElementById("imageFile").addEventListener("change", handleCSVUpload);
  document.getElementById("storeSelector").addEventListener("change", handleStoreChange);
  document.getElementById("floorSelector").addEventListener("change", handleFloorChange);
  document.getElementById("imageTypeSelect").addEventListener("change", handleMapTypeChange);
  window.addEventListener("resize", () => {
    const img = document.querySelector("#mapContainer img");
    if (img) renderMarkers(img);
  });

  // タッチイベント対応: マップパンニング
  const mapContainer = document.getElementById("mapContainer");
  let isPanning = false, startX = 0, startY = 0, scrollLeft = 0, scrollTop = 0;
  mapContainer.addEventListener("touchstart", e => {
    if (e.touches.length === 1) {
      isPanning = true;
      startX = e.touches[0].pageX - mapContainer.offsetLeft;
      startY = e.touches[0].pageY - mapContainer.offsetTop;
      scrollLeft = mapContainer.scrollLeft;
      scrollTop = mapContainer.scrollTop;
    }
  });
  mapContainer.addEventListener("touchmove", e => {
    if (!isPanning) return;
    e.preventDefault();
    const x = e.touches[0].pageX - mapContainer.offsetLeft;
    const y = e.touches[0].pageY - mapContainer.offsetTop;
    const walkX = startX - x;
    const walkY = startY - y;
    mapContainer.scrollLeft = scrollLeft + walkX;
    mapContainer.scrollTop = scrollTop + walkY;
  });
  mapContainer.addEventListener("touchend", () => {
    isPanning = false;
  });
});

function handleCSVUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.readAsText(file, "Shift_JIS");
  reader.onload = e => {
    const lines = e.target.result.split("\n").filter(Boolean);
    const hdr = lines[0].split(",");
    const janIdx  = hdr.findIndex(h => h.trim().toUpperCase() === "JAN");
    const nameIdx = hdr.findIndex(h => h.trim() === "ProductName");
    const shelfIdx= hdr.findIndex(h => h.trim().toLowerCase() === "shelf_id");
    const storeIdx= hdr.findIndex(h => h.trim().toLowerCase() === "store_id");
    const xIdx    = hdr.findIndex(h => h.trim().toUpperCase() === "X");
    const yIdx    = hdr.findIndex(h => h.trim().toUpperCase() === "Y");

    allData = lines.slice(1).map(line => {
      const c = line.split(",");
      return {
        jan: c[janIdx]?.trim() || "",
        productName: c[nameIdx]?.trim() || "",
        shelf_id: c[shelfIdx]?.trim() || "",
        store_id: c[storeIdx]?.trim().replace(/^0+/, "") || "",
        floor: (c[shelfIdx]?.trim() || "").split("_")[1] || "",
        x: parseFloat(c[xIdx]),
        y: parseFloat(c[yIdx])
      };
    });

    selectedItems = [];
    updateSelectionUI();
    populateStoreSelect();
  };
}

function populateStoreSelect() {
  const sel = document.getElementById("storeSelector");
  sel.innerHTML = "<option value=''>店舗選択</option>";
  [...new Set(allData.map(d => d.store_id))]
    .forEach(s => sel.append(new Option(s, s)));
}

function handleStoreChange(e) {
  selectedStore = e.target.value;
  populateFloorSelect();
}

function populateFloorSelect() {
  const sel = document.getElementById("floorSelector");
  sel.innerHTML = "<option value=''>フロア選択</option>";
  [...new Set(allData.filter(d => d.store_id === selectedStore).map(d => d.floor))]
    .forEach(f => sel.append(new Option(f, f)));
}

function handleFloorChange(e) {
  selectedFloor = e.target.value;
  updateMapImage();
}

function handleMapTypeChange(e) {
  selectedMapType = e.target.value;
  updateMapImage();
}

function updateMapImage() {
  const cont = document.getElementById("mapContainer");
  const img = document.createElement("img");
  img.src = `images/${selectedStore.padStart(5, "0")}_${selectedFloor}_${selectedMapType}.jpg`;
  img.onload = () => renderMarkers(img);
  cont.innerHTML = "";
  cont.appendChild(img);
}

function renderMarkers(mapImage) {
  // 既存マーカー削除
  document.querySelectorAll(".marker").forEach(m => m.remove());

  const scaleX = mapImage.clientWidth / 150;
  const scaleY = mapImage.clientHeight / 212;
  const grouped = {};
  allData
    .filter(d => d.store_id === selectedStore && d.floor === selectedFloor)
    .forEach(d => {
      grouped[d.shelf_id] = grouped[d.shelf_id] || [];
      grouped[d.shelf_id].push(d.jan);
    });

  // 重なり回避用データ
  const placed = [];
  function avoidOverlap(x, y, minDist) {
    placed.forEach(p => {
      const dx = x - p.x, dy = y - p.y;
      if (Math.hypot(dx, dy) < minDist) {
        const angle = Math.random() * 2 * Math.PI;
        x += Math.cos(angle) * minDist;
        y += Math.sin(angle) * minDist;
      }
    });
    placed.push({ x, y });
    return { x, y };
  }

  Object.entries(grouped).forEach(([shelf_id, jans]) => {
    const d0 = allData.find(d => d.shelf_id === shelf_id);
    if (!d0 || isNaN(d0.x) || isNaN(d0.y)) return;

    // 基本座標
    const rawX = d0.x * scaleX;
    const rawY = d0.y * scaleY;
    // 最小距離：マーカー最大直径の半分
    const minDist = 20;
    const { x: nx, y: ny } = avoidOverlap(rawX, rawY, minDist);

    const m = document.createElement("div");
    m.className = "marker";
    m.style.left = `${nx}px`;
    m.style.top  = `${ny}px`;
    m.textContent = shelf_id.split("_")[2];
    m.dataset.jans    = JSON.stringify(jans);
    m.dataset.shelfId = shelf_id;
    m.addEventListener("click", () => displayThumbnails(jans, shelf_id));
    document.getElementById("mapContainer").appendChild(m);
  });
}

function displayThumbnails(jans, shelf_id) {
  const cont = document.getElementById("imageContainer");
  cont.innerHTML = "";

  const instr = document.createElement("div");
  instr.className = "thumbnail-instruction";
  instr.textContent = "削除する誤登録商品をクリックしてください";
  cont.appendChild(instr);

  const markerNo = shelf_id.split("_")[2];
  const selDisp = document.createElement("div");
  selDisp.id = "selectedMarkerDisplay";
  selDisp.textContent = `選択済み番号：${markerNo}`;
  cont.appendChild(selDisp);

  const list = document.createElement("div");
  list.className = "thumb-list";
  jans.forEach(jan => {
    const full = jan.length === 8 ? jan.padStart(13, "0") : jan;
    const rec = allData.find(
      d =>
        d.shelf_id === shelf_id &&
        ((d.jan.length === 8 ? d.jan.padStart(13, "0") : d.jan) === full)
    );
    const name = rec?.productName || "（商品名不明）";

    const box = document.createElement("div");
    box.className = "thumb-box";
    box.addEventListener("click", () => addSelectedItem(shelf_id, full, name));

    const img = document.createElement("img");
    img.src = `https://shop-static.donki.com/production/images-voice/public/images/SM_${full}_1.jpg`;
    img.alt = full;

    const lblJan = document.createElement("div");
    lblJan.className = "jan-label";
    lblJan.textContent = full;

    const lblName = document.createElement("div");
    lblName.className = "jan-label";
    lblName.textContent = name.replace(/(.{10})/g, "$1\n");

    box.append(img, lblJan, lblName);
    list.appendChild(box);
  });
  cont.appendChild(list);
}

function addSelectedItem(shelf_id, jan, productName) {
  if (!selectedItems.some(i => i.shelf_id === shelf_id && i.jan === jan)) {
    selectedItems.unshift({ shelf_id, jan, productName });
    updateSelectionUI();
  }
}

function updateSelectionUI() {
  const ul = document.getElementById("selectedList");
  ul.innerHTML = "";
  selectedItems.forEach((i, idx) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "removeBtn";
    btn.textContent = "×";
    btn.dataset.index = idx;
    btn.addEventListener("click", () => {
      selectedItems.splice(idx, 1);
      updateSelectionUI();
    });
    li.append(btn, document.createTextNode(` ${i.shelf_id}, ${i.jan}, ${i.productName}`));
    ul.appendChild(li);
  });
}

function exportCSV() {
  if (!selectedItems.length) return alert("項目が選択されていません");
  let csv = "shelf_id,jan,ProductName\n";
  selectedItems.forEach(i => {
    const safe = `"${i.productName.replace(/"/g, '""')}"`;
    csv += `${i.shelf_id},${i.jan},${safe}\n`;
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "誤登録リスト.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
