import {
  SUPPORTED_COUNTRIES,
  getSettings,
  saveSettings,
} from "./shared/settings.js";

const countrySelect = document.getElementById("country");
const apiInput = document.getElementById("apiBaseUrl");
const saveButton = document.getElementById("save");
const statusEl = document.getElementById("status");

async function init() {
  for (const { code, label } of SUPPORTED_COUNTRIES) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = label;
    countrySelect.append(option);
  }

  const settings = await getSettings();
  countrySelect.value = settings.country;
  apiInput.value = settings.apiBaseUrl;
}

saveButton.addEventListener("click", async () => {
  const saved = await saveSettings({
    country: countrySelect.value,
    apiBaseUrl: apiInput.value,
  });
  apiInput.value = saved.apiBaseUrl; // reflect normalization
  statusEl.textContent = "تم الحفظ ✓";
  setTimeout(() => (statusEl.textContent = ""), 2000);
});

init();
