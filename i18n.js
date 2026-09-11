(function () {
  const DEFAULT_LANG = "en";
  const SUPPORTED_LANGS = {
    en: "English",
    de: "Deutsch",
    fr: "Français",
    es: "Español",
    ru: "Русский"
  };

  let translations = {};

  // Auto-detect browser language or read saved preference
  function detectInitialLang() {
    const saved = localStorage.getItem("pumpkin_lang");
    if (saved && SUPPORTED_LANGS[saved]) {
      return saved;
    }

    // Auto-detect from navigator.languages / navigator.language
    const browserLangs = navigator.languages || [navigator.language || navigator.userLanguage || "en"];
    for (let lang of browserLangs) {
      if (!lang) continue;
      const code = lang.toLowerCase().split("-")[0];
      if (SUPPORTED_LANGS[code]) {
        return code;
      }
    }

    return DEFAULT_LANG;
  }

  function saveLang(lang) {
    localStorage.setItem("pumpkin_lang", lang);
  }

  async function loadTranslations(lang) {
    try {
      const isSubdir = window.location.pathname.includes("/developers/") ||
                        window.location.pathname.includes("/download/") ||
                        window.location.pathname.includes("/donate/") ||
                        window.location.pathname.includes("/contributors/") ||
                        window.location.pathname.includes("/stats/");
      const basePath = isSubdir ? "../locales/" : "locales/";

      const res = await fetch(`${basePath}${lang}.json`);
      if (!res.ok) throw new Error(`Could not load ${lang} locale from ${basePath}${lang}.json`);
      translations = await res.json();
      applyTranslations();
      document.documentElement.lang = lang;
      updateLangSelectorUI(lang);
      updateSEOMeta(lang);
    } catch (err) {
      console.warn("i18n translation load error:", err);
    }
  }

  function updateSEOMeta(lang) {
    // Dynamically manage hreflang tags for SEO
    let baseCanonical = window.location.origin + window.location.pathname;
    
    // Remove existing hreflang tags
    document.querySelectorAll("link[rel='alternate'][hreflang]").forEach(el => el.remove());

    Object.keys(SUPPORTED_LANGS).forEach(code => {
      const link = document.createElement("link");
      link.rel = "alternate";
      link.hreflang = code;
      link.href = baseCanonical;
      document.head.appendChild(link);
    });

    const xDefault = document.createElement("link");
    xDefault.rel = "alternate";
    xDefault.hreflang = "x-default";
    xDefault.href = baseCanonical;
    document.head.appendChild(xDefault);
  }

  function getNestedTranslation(key) {
    return key.split(".").reduce((obj, k) => (obj && obj[k] !== undefined ? obj[k] : null), translations);
  }

  function applyTranslations() {
    const elements = document.querySelectorAll("[data-i18n]");
    elements.forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const val = getNestedTranslation(key);
      if (val !== null) {
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          el.placeholder = val;
        } else {
          el.textContent = val;
        }
      }
    });
  }

  function buildLangDropdown() {
    const headerIcons = document.querySelector(".header-icons");
    if (!headerIcons || document.getElementById("lang-select-dropdown")) return;

    const container = document.createElement("div");
    container.className = "lang-dropdown-wrapper";
    container.id = "lang-select-dropdown";

    const currentLang = detectInitialLang();

    container.innerHTML = `
      <button class="icon-btn lang-toggle-btn" type="button" title="Language / Sprachauswahl" aria-label="Change language">
        <i class="fa-solid fa-globe"></i>
        <span class="current-lang-code">${currentLang.toUpperCase()}</span>
      </button>
      <div class="lang-dropdown-menu">
        ${Object.entries(SUPPORTED_LANGS)
          .map(
            ([code, name]) =>
              `<button type="button" class="lang-opt ${code === currentLang ? "active" : ""}" data-lang-code="${code}">
                ${name} (${code.toUpperCase()})
              </button>`
          )
          .join("")}
      </div>
    `;

    headerIcons.insertBefore(container, headerIcons.firstChild);

    const toggleBtn = container.querySelector(".lang-toggle-btn");
    const menu = container.querySelector(".lang-dropdown-menu");

    toggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      menu.classList.toggle("show");
    });

    document.addEventListener("click", () => {
      menu.classList.remove("show");
    });

    menu.querySelectorAll(".lang-opt").forEach((opt) => {
      opt.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const lang = opt.getAttribute("data-lang-code");
        saveLang(lang);
        loadTranslations(lang);
        menu.classList.remove("show");
      });
    });
  }

  function updateLangSelectorUI(lang) {
    const codeSpan = document.querySelector(".current-lang-code");
    if (codeSpan) codeSpan.textContent = lang.toUpperCase();

    document.querySelectorAll(".lang-opt").forEach((opt) => {
      if (opt.getAttribute("data-lang-code") === lang) {
        opt.classList.add("active");
      } else {
        opt.classList.remove("active");
      }
    });
  }

  function init() {
    buildLangDropdown();
    const initialLang = detectInitialLang();
    loadTranslations(initialLang);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
