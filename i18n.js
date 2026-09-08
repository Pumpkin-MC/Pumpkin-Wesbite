(function () {
  const DEFAULT_LANG = "en";
  const SUPPORTED_LANGS = {
    en: "English",
    de: "Deutsch",
    fr: "Français",
    es: "Español",
    pl: "Polski"
  };

  let translations = {};
  let fallbackTranslations = {};
  let defaultsInitialized = false;

  function getBasePath() {
    const isSubdir = window.location.pathname.includes("/developers/") ||
                     window.location.pathname.includes("/download/") ||
                     window.location.pathname.includes("/donate/") ||
                     window.location.pathname.includes("/contributors/") ||
                     window.location.pathname.includes("/stats/");
    return isSubdir ? "../locales/" : "locales/";
  }

  // Record initial English texts from the HTML DOM before any translations are applied
  function initDefaultTexts() {
    if (defaultsInitialized) return;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      if (el.dataset.i18nDefault === undefined) {
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          el.dataset.i18nDefault = el.placeholder || "";
        } else {
          el.dataset.i18nDefault = el.textContent || "";
        }
      }
    });
    defaultsInitialized = true;
  }

  // Auto-detect browser language or read saved preference
  function detectInitialLang() {
    const saved = localStorage.getItem("pumpkin_lang");
    if (saved && SUPPORTED_LANGS[saved]) {
      return saved;
    }

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

  // Load English fallback dictionary
  async function loadFallbackTranslations() {
    if (Object.keys(fallbackTranslations).length > 0) {
      return fallbackTranslations;
    }
    try {
      const res = await fetch(`${getBasePath()}en.json`);
      if (res.ok) {
        fallbackTranslations = await res.json();
      }
    } catch (err) {
      console.warn("Could not load English fallback locale:", err);
    }
    return fallbackTranslations;
  }

  async function loadTranslations(lang) {
    initDefaultTexts();

    try {
      // Ensure English fallback is loaded
      await loadFallbackTranslations();

      if (lang === DEFAULT_LANG) {
        translations = fallbackTranslations;
      } else {
        const res = await fetch(`${getBasePath()}${lang}.json`);
        if (!res.ok) throw new Error(`Could not load ${lang} locale from ${getBasePath()}${lang}.json`);
        translations = await res.json();
      }

      applyTranslations();
      document.documentElement.lang = lang;
      updateLangSelectorUI(lang);
      updateSEOMeta(lang);

      // Notify any page-specific scripts of language change
      window.dispatchEvent(new CustomEvent("pumpkin-lang-change", { detail: { lang } }));
    } catch (err) {
      console.warn("i18n translation load error:", err);
      // On error, fallback to English
      translations = fallbackTranslations;
      applyTranslations();
      document.documentElement.lang = DEFAULT_LANG;
      updateLangSelectorUI(DEFAULT_LANG);
      // Notify page-specific scripts so dynamic labels also fall back to English
      window.dispatchEvent(new CustomEvent("pumpkin-lang-change", { detail: { lang: DEFAULT_LANG } }));
    }
  }

  function updateSEOMeta(lang) {
    let baseCanonical = window.location.origin + window.location.pathname;
    
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

  function getNestedTranslation(key, dict) {
    if (!dict) return null;
    return key.split(".").reduce((obj, k) => (obj && obj[k] !== undefined ? obj[k] : null), dict);
  }

  function resolveTranslation(key, el) {
    // 1. Try active language
    let val = getNestedTranslation(key, translations);
    if (val !== null && val !== undefined && val !== "") return val;

    // 2. Fallback to English dictionary
    val = getNestedTranslation(key, fallbackTranslations);
    if (val !== null && val !== undefined && val !== "") return val;

    // 3. Fallback to original text from HTML markup
    if (el && el.dataset.i18nDefault !== undefined && el.dataset.i18nDefault !== "") {
      return el.dataset.i18nDefault;
    }

    return null;
  }

  function applyTranslations() {
    const elements = document.querySelectorAll("[data-i18n]");
    elements.forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const val = resolveTranslation(key, el);
      if (val !== null && val !== undefined) {
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
      <button class="icon-btn lang-toggle-btn" type="button" title="Language" aria-label="Change language">
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
    initDefaultTexts();
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
