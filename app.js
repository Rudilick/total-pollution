let dropdownData = {};
let unitMap = {};

async function init() {
  const res = await fetch("YOUR_BACKEND_URL/init-data");
  const data = await res.json();

  dropdownData = data.dropdown;
  unitMap = data.unit_map;

  buildMajor();
}

function buildMajor() {
  const select = document.getElementById("major");
  Object.keys(dropdownData).forEach(k => {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k;
    select.appendChild(opt);
  });
}

function onMajorChange(val) {
  const midSelect = document.getElementById("mid");
  midSelect.innerHTML = "";

  Object.keys(dropdownData[val]).forEach(k => {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k;
    midSelect.appendChild(opt);
  });
}

function calculate() {
  const value = Number(document.getElementById("val").value);
  const major = document.getElementById("major").value;
  const mid = document.getElementById("mid").value;

  const key = `${major}>${mid}>`;
  const unit = unitMap[key];

  document.getElementById("result").innerText =
    `결과: ${value} ${unit}`;
}

window.onload = init;
