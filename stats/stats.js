(function () {
  "use strict";

  const API_BASE = "https://market.pumpkinmc.org/api/v1/rest/telemetry";
  let state = {
    overview: null,
    trends: [],
    systems: null,
    geo: [],
    plugins: [],
    trendMode: "players", // 'players' | 'servers'
    mapMode: "servers", // 'servers' | 'players'
    geoSort: "servers", // 'servers' | 'players'
    lastFetchTime: null,
    isLoading: false,
  };

  // Dynamic-string translations for the stats dashboard.
  // Static markup is translated via data-i18n (i18n.js); everything
  // rendered here at runtime goes through st()/fmt() so the language
  // switcher (pumpkin-lang-change) also updates live content.
  let statsStrings = {};

  function getStatsLang() {
    try {
      const saved = localStorage.getItem("pumpkin_lang");
      if (saved) return saved.toLowerCase().split("-")[0];
    } catch {
      // ignore storage errors, fall through to browser detection
    }
    const browserLangs = (typeof navigator !== "undefined" && (navigator.languages || [navigator.language])) || ["en"];
    for (const lang of browserLangs) {
      if (!lang) continue;
      const code = String(lang).toLowerCase().split("-")[0];
      if (code) return code;
    }
    return "en";
  }

  async function loadStatsStrings() {
    const lang = getStatsLang();
    const tried = [];
    if (lang && lang !== "en") tried.push(lang);
    tried.push("en");
    for (const code of tried) {
      try {
        const res = await fetch(`../locales/${code}.json`);
        if (!res.ok) continue;
        const data = await res.json();
        if (data && data.stats && Object.keys(data.stats).length > 0) {
          statsStrings = data.stats;
          return;
        }
      } catch {
        // try next fallback language
      }
    }
    statsStrings = {};
  }

  function st(key, fallback) {
    const val = statsStrings[key];
    if (val !== null && val !== undefined && val !== "") return val;
    return fallback;
  }

  function fmt(template, params) {
    let s = String(template);
    if (params) {
      for (const k of Object.keys(params)) {
        s = s.split(`{${k}}`).join(String(params[k]));
      }
    }
    return s;
  }

  // Format numbers with locale commas
  function formatNumber(num) {
    if (num === null || num === undefined) return "0";
    return Number(num).toLocaleString();
  }

  // Format relative minutes ago
  function formatMinutesAgo(mins) {
    if (mins === undefined || mins === null) return st("unknown", "Unknown");
    if (mins <= 1) return st("activeJustNow", "Active just now");
    if (mins < 60) return fmt(st("minutesAgo", "{m}m ago"), { m: mins });
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    if (rem > 0) return fmt(st("hoursMinutesAgo", "{h}h {m}m ago"), { h: hours, m: rem });
    return fmt(st("hoursAgo", "{h}h ago"), { h: hours });
  }

  // Format timestamp into clean local time
  function formatTimestamp(isoStr) {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return isoStr;
    }
  }

  function formatFullDateTime(isoStr) {
    if (!isoStr) return st("never", "Never");
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoStr;
    }
  }

  // Fetch all telemetry endpoints concurrently
  async function fetchTelemetryData() {
    if (state.isLoading) return;
    state.isLoading = true;

    const refreshBtn = document.getElementById("refresh-btn");
    if (refreshBtn) refreshBtn.classList.add("spinning");

    try {
      const [overviewRes, trendsRes, systemsRes, geoRes, pluginsRes] =
        await Promise.allSettled([
          fetch(`${API_BASE}/overview`).then((r) => (r.ok ? r.json() : null)),
          fetch(`${API_BASE}/trends`).then((r) => (r.ok ? r.json() : [])),
          fetch(`${API_BASE}/systems`).then((r) => (r.ok ? r.json() : null)),
          fetch(`${API_BASE}/geo`).then((r) => (r.ok ? r.json() : [])),
          fetch(`${API_BASE}/plugins`).then((r) => (r.ok ? r.json() : [])),
        ]);

      if (overviewRes.status === "fulfilled" && overviewRes.value) {
        state.overview = overviewRes.value;
      }
      if (trendsRes.status === "fulfilled" && Array.isArray(trendsRes.value)) {
        state.trends = trendsRes.value;
      }
      if (systemsRes.status === "fulfilled" && systemsRes.value) {
        state.systems = systemsRes.value;
      }
      if (geoRes.status === "fulfilled" && Array.isArray(geoRes.value)) {
        state.geo = geoRes.value;
      }
      if (pluginsRes.status === "fulfilled" && Array.isArray(pluginsRes.value)) {
        state.plugins = pluginsRes.value;
      }

      state.lastFetchTime = new Date();
      renderAll();
    } catch (err) {
      console.error("Failed to load telemetry:", err);
    } finally {
      state.isLoading = false;
      if (refreshBtn) refreshBtn.classList.remove("spinning");
    }
  }


  // Render everything
  function renderAll() {
    renderKPIs();
    renderVitals();
    renderWorldMap();
    renderChart();
    renderSystems();
    renderGeo();
    renderPlugins();
    renderToolbarMeta();
  }

  function renderToolbarMeta() {
    const timeEl = document.getElementById("last-updated-text");
    if (!timeEl) return;
    if (!state.lastFetchTime) {
      timeEl.textContent = st("connecting", "Connecting...");
      return;
    }
    timeEl.textContent = state.lastFetchTime.toLocaleTimeString();
  }

  // Render KPIs
  function renderKPIs() {
    const o = state.overview;
    if (!o) return;

    // Active 24h Servers
    const activeServersEl = document.getElementById("kpi-active-servers");
    if (activeServersEl) activeServersEl.textContent = formatNumber(o.active_24h_servers);

    const liveSplitEl = document.getElementById("kpi-live-split");
    if (liveSplitEl) {
      liveSplitEl.innerHTML = `
        <span class="badge-tag pumpkin"><span class="node-dot pumpkin-dot"></span> Pumpkin: ${formatNumber(o.live_pumpkin_servers)}</span>
        <span class="badge-tag vine"><span class="node-dot vine-dot"></span> Vine: ${formatNumber(o.live_vine_servers)}</span>
        <span style="opacity: 0.8; font-size: 0.8rem;">(${formatNumber(o.live_servers)} ${st("liveNow", "live now")})</span>
      `;
    }

    // Peak 24h Players
    const peakPlayersEl = document.getElementById("kpi-peak-players");
    if (peakPlayersEl) peakPlayersEl.textContent = formatNumber(o.peak_24h_players);

    const currentPlayersEl = document.getElementById("kpi-current-players");
    if (currentPlayersEl) {
      currentPlayersEl.innerHTML = `
        <i class="fa-solid fa-user-group" style="color: var(--color-green);"></i>
        <strong>${formatNumber(o.total_online_players)}</strong> ${st("onlineRightNow", "online right now")}
      `;
    }

    // Global Countries
    const totalCountriesEl = document.getElementById("kpi-total-countries");
    if (totalCountriesEl) totalCountriesEl.textContent = formatNumber(o.total_countries);

    const topGeoEl = document.getElementById("kpi-top-geo");
    if (topGeoEl) {
      if (state.geo && state.geo.length > 0) {
        const topCountry = state.geo[0];
        topGeoEl.innerHTML = `
          <span>${st("topRegion", "Top region:")} <span class="iso-badge">${topCountry.country}</span> <strong>${topCountry.country_name}</strong></span>
        `;
      } else {
        topGeoEl.textContent = "";
      }
    }

    // Tracked Plugins
    const totalPluginsEl = document.getElementById("kpi-total-plugins");
    if (totalPluginsEl) totalPluginsEl.textContent = formatNumber(o.total_tracked_plugins);

    const pluginsSubEl = document.getElementById("kpi-plugins-sub");
    if (pluginsSubEl) {
      if (o.total_tracked_plugins > 0) {
        pluginsSubEl.innerHTML = `
          <i class="fa-solid fa-puzzle-piece" style="color: var(--color-yellow);"></i>
          <span>${formatNumber(o.total_tracked_plugins)} ${st("modulesDetected", "modules detected")}</span>
        `;
      } else {
        pluginsSubEl.textContent = "";
      }
    }
  }

  // Render Secondary Vitals Bar
  function renderVitals() {
    const o = state.overview;
    if (!o) return;

    // Global Presence
    const countriesEl = document.getElementById("vital-countries-span");
    const countriesNote = document.getElementById("vital-countries-note");
    if (countriesEl) countriesEl.textContent = formatNumber(o.total_countries);
    if (countriesNote) {
      const topCountry = state.geo && state.geo[0] ? `${state.geo[0].country_name} [${state.geo[0].country}]` : st("activeNodes", "Active nodes");
      countriesNote.textContent = `${st("leading", "Leading:")} ${topCountry}`;
    }

    // Node Liveness Rate
    const livenessRate = o.active_24h_servers > 0
      ? ((o.live_servers / o.active_24h_servers) * 100).toFixed(1)
      : "0.0";
    const liveRateEl = document.getElementById("vital-liveness-rate");
    const liveRateNote = document.getElementById("vital-liveness-note");
    if (liveRateEl) liveRateEl.textContent = `${livenessRate}%`;
    if (liveRateNote) liveRateNote.textContent = fmt(st("respondingNow", "{live} of {active} servers responding now"), { live: o.live_servers, active: o.active_24h_servers });

    // Average Players Per Node
    const avgLoad = o.active_24h_servers > 0
      ? (o.total_online_players / o.active_24h_servers).toFixed(1)
      : "0.0";
    const avgLoadEl = document.getElementById("vital-avg-load");
    const avgLoadNote = document.getElementById("vital-avg-load-note");
    if (avgLoadEl) avgLoadEl.textContent = avgLoad;
    if (avgLoadNote) {
      const peakPerNode = o.active_24h_servers > 0
        ? (o.peak_24h_players / o.active_24h_servers).toFixed(1)
        : "0.0";
      avgLoadNote.textContent = fmt(st("peakPerNode", "24h peak: {v} players / node"), { v: peakPerNode });
    }

    // Proxy vs Backend Ratio
    const proxyRatioEl = document.getElementById("vital-proxy-ratio");
    const proxyRatioNote = document.getElementById("vital-proxy-note");
    if (proxyRatioEl) {
      const totalLive = o.live_pumpkin_servers + o.live_vine_servers;
      if (totalLive > 0) {
        const vinePct = ((o.live_vine_servers / totalLive) * 100).toFixed(0);
        const pumpkinPct = ((o.live_pumpkin_servers / totalLive) * 100).toFixed(0);
        proxyRatioEl.textContent = `${vinePct}% Vine / ${pumpkinPct}% Pumpkin`;
      } else {
        proxyRatioEl.textContent = `${o.live_vine_servers} Vine : ${o.live_pumpkin_servers} Pumpkin`;
      }
    }
    if (proxyRatioNote) {
      proxyRatioNote.textContent = st("multiTier", "Multi-tier network routing");
    }
  }

  let mapInstance = null;

  // Render World Map using jsVectorMap
  function renderWorldMap() {
    const container = document.getElementById("map-container");
    if (!container) return;
    if (typeof jsVectorMap === "undefined") {
      container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><div>${st("initializingMap", "Initializing map engine...")}</div></div>`;
      return;
    }

    const geo = state.geo || [];
    const isServers = state.mapMode === "servers";

    const values = {};
    geo.forEach((item) => {
      values[item.country] = isServers ? item.servers : item.players;
    });

    if (mapInstance) {
      try {
        mapInstance.destroy();
      } catch (e) {
        // ignore destroy
      }
      mapInstance = null;
    }
    container.innerHTML = "";

    try {
      mapInstance = new jsVectorMap({
        selector: "#map-container",
        map: "world",
        backgroundColor: "transparent",
        draggable: true,
        zoomButtons: true,
        zoomOnScroll: false,
        regionStyle: {
          initial: {
            fill: "#181818",
            stroke: "#2a2a2a",
            strokeWidth: 0.7,
            fillOpacity: 1,
          },
          hover: {
            fillOpacity: 0.85,
            cursor: "pointer",
          },
          selected: {
            fill: "#ff6b2c",
          },
        },
        visualizeData: {
          scale: ["#5c2000", "#ff6b2c"],
          values: values,
        },
        onRegionTooltipShow(event, tooltip, code) {
          const item = geo.find((g) => g.country === code);
          if (item) {
            const avgPerNode = item.servers > 0 ? (item.players / item.servers).toFixed(1) : "0";
            tooltip.text(
              `<div class="map-tooltip-title">
                <span class="iso-badge">${item.country}</span>
                <span>${item.country_name}</span>
              </div>
              <div class="map-tooltip-row">
                <span>${st("tipServers", "Servers:")}</span>
                <strong>${formatNumber(item.servers)} (${item.percentage.toFixed(1)}%)</strong>
              </div>
              <div class="map-tooltip-row">
                <span>${st("tipPlayerTraffic", "Player Traffic:")}</span>
                <strong>${formatNumber(item.players)} ${st("playersUnit", "players")}</strong>
              </div>
              <div class="map-tooltip-row">
                <span>${st("tipDensity", "Density:")}</span>
                <strong>${avgPerNode} ${st("playersUnit", "players")} ${st("perNode", "/ node")}</strong>
              </div>`,
              true
            );
          } else {
            const currentName = typeof tooltip.text === "function" ? tooltip.text() : code;
            tooltip.text(
              `<div class="map-tooltip-title">
                <span class="iso-badge">${code}</span>
                <span>${currentName}</span>
              </div>
              <div class="map-tooltip-row" style="opacity: 0.6;">
                <span>${st("noTelemetryNodes", "No active telemetry nodes")}</span>
              </div>`,
              true
            );
          }
        },
        onRegionClick(event, code) {
          const item = geo.find((g) => g.country === code);
          if (item) {
            window.pumpkinStatsFocusCountry(code);
          }
        },
      });
    } catch (err) {
      console.error("jsVectorMap initialization error:", err);
    }

    // Update map summary stats
    const topCountry = geo[0];
    const mapTopNode = document.getElementById("map-stat-top");
    const mapTotalGeo = document.getElementById("map-stat-total");
    const mapTotalPlayers = document.getElementById("map-stat-players");
    const mapAvgDensity = document.getElementById("map-stat-density");

    if (mapTopNode && topCountry) {
      mapTopNode.textContent = `${topCountry.country_name} [${topCountry.country}]`;
    }
    if (mapTotalGeo) {
      mapTotalGeo.textContent = fmt(st("activeRegions", "{n} Active Regions"), { n: geo.length });
    }
    if (mapTotalPlayers) {
      const sumPlayers = geo.reduce((acc, g) => acc + g.players, 0);
      mapTotalPlayers.textContent = formatNumber(sumPlayers);
    }
    if (mapAvgDensity) {
      const sumS = geo.reduce((acc, g) => acc + g.servers, 0);
      const sumP = geo.reduce((acc, g) => acc + g.players, 0);
      mapAvgDensity.textContent = sumS > 0 ? `${(sumP / sumS).toFixed(1)} ${st("perNode", "/ node")}` : st("zeroPerNode", "0 / node");
    }
  }

  // Render Interactive Trends Chart
  function renderChart() {
    const wrap = document.getElementById("chart-wrap");
    const svg = document.getElementById("chart-svg");
    if (!wrap || !svg) return;

    const data = state.trends;
    if (!data || data.length === 0) {
      svg.innerHTML = `
        <text x="50%" y="50%" text-anchor="middle" fill="#888" font-size="14">
          ${st("noTrendData", "No telemetry trend data available")}
        </text>
      `;
      return;
    }

    const rect = wrap.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 320;
    const padLeft = 45;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 35;

    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    const isPlayers = state.trendMode === "players";

    let series1 = [];
    let series2 = [];
    let series3 = [];

    if (isPlayers) {
      series1 = data.map((d) => d.online_players || 0);
      series2 = data.map((d) => d.peak_players || 0);
    } else {
      series1 = data.map((d) => d.active_servers || 0);
      series2 = data.map((d) => d.pumpkin_servers || 0);
      series3 = data.map((d) => d.vine_servers || 0);
    }

    const allValues = [...series1, ...series2, ...(series3 || [])];
    const maxVal = Math.max(...allValues, 1);
    const yCeil = Math.ceil(maxVal * 1.15);

    const xStep = data.length > 1 ? chartW / (data.length - 1) : chartW;

    function getX(i) {
      return padLeft + i * xStep;
    }

    function getY(val) {
      return padTop + chartH - (val / yCeil) * chartH;
    }

    function buildLinePath(series) {
      return series
        .map((val, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(val).toFixed(1)}`)
        .join(" ");
    }

    function buildAreaPath(series) {
      const line = buildLinePath(series);
      const bottomY = (padTop + chartH).toFixed(1);
      const startX = getX(0).toFixed(1);
      const endX = getX(series.length - 1).toFixed(1);
      return `${line} L ${endX} ${bottomY} L ${startX} ${bottomY} Z`;
    }

    const ySteps = 4;
    let gridSvg = "";
    for (let i = 0; i <= ySteps; i++) {
      const val = Math.round((yCeil / ySteps) * i);
      const y = getY(val);
      gridSvg += `
        <line x1="${padLeft}" y1="${y}" x2="${padLeft + chartW}" y2="${y}" class="chart-grid-line" />
        <text x="${padLeft - 8}" y="${y + 4}" class="chart-axis-label" text-anchor="end">${val}</text>
      `;
    }

    let xLabelsSvg = "";
    const labelInterval = Math.max(1, Math.floor(data.length / 6));
    data.forEach((d, i) => {
      if (i % labelInterval === 0 || i === data.length - 1) {
        const x = getX(i);
        const timeStr = formatTimestamp(d.timestamp);
        xLabelsSvg += `
          <text x="${x}" y="${padTop + chartH + 20}" class="chart-axis-label" text-anchor="middle">${timeStr}</text>
        `;
      }
    });

    let pathsSvg = "";
    if (isPlayers) {
      pathsSvg += `
        <defs>
          <linearGradient id="areaGradOrange" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ff6b2c" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="#ff6b2c" stop-opacity="0.0"/>
          </linearGradient>
          <linearGradient id="areaGradBlue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#4169e1" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="#4169e1" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <path d="${buildAreaPath(series2)}" fill="url(#areaGradBlue)" />
        <path d="${buildLinePath(series2)}" fill="none" stroke="#4169e1" stroke-width="2.5" stroke-dasharray="3 3" />
        <path d="${buildAreaPath(series1)}" fill="url(#areaGradOrange)" />
        <path d="${buildLinePath(series1)}" fill="none" stroke="#ff6b2c" stroke-width="3" />
      `;
    } else {
      pathsSvg += `
        <defs>
          <linearGradient id="areaGradTotal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ff6b2c" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#ff6b2c" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <path d="${buildAreaPath(series1)}" fill="url(#areaGradTotal)" />
        <path d="${buildLinePath(series1)}" fill="none" stroke="#ff6b2c" stroke-width="3" />
        <path d="${buildLinePath(series2)}" fill="none" stroke="#ffd93d" stroke-width="2" />
        <path d="${buildLinePath(series3)}" fill="none" stroke="#00c853" stroke-width="2" />
      `;
    }

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.innerHTML = `
      ${gridSvg}
      ${pathsSvg}
      ${xLabelsSvg}
      <line id="chart-crosshair" x1="0" y1="${padTop}" x2="0" y2="${padTop + chartH}" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="2 2" style="display: none; pointer-events: none;" />
    `;

    const tooltip = document.getElementById("chart-tooltip");
    const crosshair = document.getElementById("chart-crosshair");

    wrap.onmousemove = function (e) {
      const bounds = wrap.getBoundingClientRect();
      const mouseX = e.clientX - bounds.left;
      if (mouseX < padLeft || mouseX > padLeft + chartW) {
        if (tooltip) tooltip.style.display = "none";
        if (crosshair) crosshair.style.display = "none";
        return;
      }

      const ratio = (mouseX - padLeft) / chartW;
      const index = Math.min(
        data.length - 1,
        Math.max(0, Math.round(ratio * (data.length - 1)))
      );
      const point = data[index];
      if (!point) return;

      const px = getX(index);
      if (crosshair) {
        crosshair.setAttribute("x1", px);
        crosshair.setAttribute("x2", px);
        crosshair.style.display = "block";
      }

      if (tooltip) {
        let content = `<div class="tip-time">${formatFullDateTime(point.timestamp)}</div>`;
        if (isPlayers) {
          content += `
            <div class="tip-val" style="color: #ff6b2c;">
              <span class="node-dot pumpkin-dot"></span>
              ${st("tipOnline", "Online:")} <strong>${formatNumber(point.online_players)}</strong>
            </div>
            <div class="tip-val" style="color: #6c92ff; font-size: 0.8rem; margin-top: 2px;">
              <span class="node-dot" style="background: #4169e1;"></span>
              ${st("tipPeak", "Peak:")} <strong>${formatNumber(point.peak_players)}</strong>
            </div>
          `;
        } else {
          content += `
            <div class="tip-val" style="color: #ff6b2c;">
              <span class="node-dot pumpkin-dot"></span>
              ${st("tipActiveTotal", "Active Total:")} <strong>${formatNumber(point.active_servers)}</strong>
            </div>
            <div class="tip-val" style="color: #ffd93d; font-size: 0.8rem; margin-top: 2px;">
              <span class="node-dot" style="background: #ffd93d;"></span>
              Pumpkin: <strong>${formatNumber(point.pumpkin_servers)}</strong>
            </div>
            <div class="tip-val" style="color: #55efc4; font-size: 0.8rem; margin-top: 2px;">
              <span class="node-dot vine-dot"></span>
              Vine: <strong>${formatNumber(point.vine_servers)}</strong>
            </div>
          `;
        }

        tooltip.innerHTML = content;
        tooltip.style.left = `${px}px`;
        tooltip.style.top = `${getY(series1[index])}px`;
        tooltip.style.display = "block";
      }
    };

    wrap.onmouseleave = function () {
      if (tooltip) tooltip.style.display = "none";
      if (crosshair) crosshair.style.display = "none";
    };

    const sumPeak = document.getElementById("chart-sum-peak");
    const sumAvg = document.getElementById("chart-sum-avg");
    const sumMin = document.getElementById("chart-sum-min");
    const sumNow = document.getElementById("chart-sum-now");

    if (isPlayers) {
      const peakVal = Math.max(...data.map((d) => d.peak_players || 0), 0);
      const minVal = Math.min(...data.map((d) => d.online_players || 0));
      const avgVal = Math.round(
        data.reduce((acc, d) => acc + (d.online_players || 0), 0) / (data.length || 1)
      );
      const nowVal = data[data.length - 1]?.online_players || 0;

      if (sumPeak) sumPeak.textContent = formatNumber(peakVal);
      if (sumAvg) sumAvg.textContent = formatNumber(avgVal);
      if (sumMin) sumMin.textContent = formatNumber(minVal);
      if (sumNow) sumNow.textContent = formatNumber(nowVal);
    } else {
      const peakVal = Math.max(...data.map((d) => d.active_servers || 0), 0);
      const minVal = Math.min(...data.map((d) => d.active_servers || 0));
      const avgVal = Math.round(
        data.reduce((acc, d) => acc + (d.active_servers || 0), 0) / (data.length || 1)
      );
      const nowVal = data[data.length - 1]?.active_servers || 0;

      if (sumPeak) sumPeak.textContent = formatNumber(peakVal);
      if (sumAvg) sumAvg.textContent = formatNumber(avgVal);
      if (sumMin) sumMin.textContent = formatNumber(minVal);
      if (sumNow) sumNow.textContent = formatNumber(nowVal);
    }
  }

  // Render Systems & Hardware Distributions
  function renderSystems() {
    const s = state.systems;
    if (!s) return;

    function renderDistList(containerId, items, accentClass = "") {
      const container = document.getElementById(containerId);
      if (!container) return;

      if (!items || items.length === 0) {
        container.innerHTML = `<div class="empty-state">${st("noDistData", "No distribution data reported")}</div>`;
        return;
      }

      container.innerHTML = items
        .map((item) => {
          const pct = item.percentage.toFixed(1);
          let icon = "";
          const lbl = item.label.toLowerCase();
          if (lbl.includes("linux")) {
            icon = '<i class="fa-brands fa-linux"></i> ';
          } else if (lbl.includes("windows")) {
            icon = '<i class="fa-brands fa-windows"></i> ';
          } else if (lbl.includes("macos") || lbl.includes("apple")) {
            icon = '<i class="fa-brands fa-apple"></i> ';
          } else if (lbl.includes("pumpkin")) {
            icon = '<span class="node-dot pumpkin-dot"></span> ';
          } else if (lbl.includes("vine")) {
            icon = '<span class="node-dot vine-dot"></span> ';
          }

          return `
            <div class="dist-item">
              <div class="dist-item-top">
                <span class="dist-item-label">${icon}${item.label}</span>
                <span class="dist-item-counts"><strong>${item.count}</strong> (${pct}%)</span>
              </div>
              <div class="dist-bar-track">
                <div class="dist-bar-fill ${accentClass}" style="width: ${pct}%;"></div>
              </div>
            </div>
          `;
        })
        .join("");
    }

    renderDistList("dist-os", s.os, "");
    renderDistList("dist-arch", s.arch, "accent-blue");
    renderDistList("dist-software", s.software_versions, "accent-green");
    renderDistList("dist-mc", s.minecraft_versions, "accent-yellow");
    renderDistList("dist-ram", s.ram_distribution, "accent-purple");
    renderDistList("dist-total-ram", s.total_ram_distribution, "accent-blue");
    renderDistList("dist-cpu", s.cpu_models, "");
  }

  // Render Geo Distribution
  function renderGeo() {
    const container = document.getElementById("geo-list");
    if (!container) return;

    let items = [...(state.geo || [])];
    if (items.length === 0) {
      container.innerHTML = `<div class="empty-state">${st("noGeoData", "No geolocation data reported")}</div>`;
      return;
    }

    if (state.geoSort === "players") {
      items.sort((a, b) => b.players - a.players);
    } else {
      items.sort((a, b) => b.servers - a.servers);
    }

    container.innerHTML = items
      .map((item) => {
        const pct = item.percentage.toFixed(1);

        return `
          <div class="dist-item" id="geo-item-${item.country}">
            <div class="dist-item-top">
              <span class="dist-item-label">
                <span class="iso-badge">${item.country}</span>
                <span>${item.country_name}</span>
              </span>
              <span class="dist-item-counts">
                <strong>${formatNumber(item.servers)}</strong> ${st("serversUnit", "servers")} · <strong>${formatNumber(item.players)}</strong> ${st("playersUnit", "players")} (${pct}%)
              </span>
            </div>
            <div class="dist-bar-track">
              <div class="dist-bar-fill" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  window.pumpkinStatsFocusCountry = function (code) {
    const target = document.getElementById(`geo-item-${code}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.remove("highlight-pulse");
      void target.offsetWidth;
      target.classList.add("highlight-pulse");
    }
  };

  // Render Top Plugins
  function renderPlugins() {
    const container = document.getElementById("plugins-list");
    if (!container) return;

    const items = state.plugins || [];
    if (items.length === 0) {
      container.innerHTML = `<div class="empty-state">${st("noPluginData", "No plugin telemetry reported")}</div>`;
      return;
    }

    container.innerHTML = items
      .map((p) => {
        let marketBadge = "";
        if (p.market_plugin_id) {
          marketBadge = `
            <a href="https://market.pumpkinmc.org/" class="plugin-market-link" target="_blank" rel="noopener" title="Available on Marketplace">
              <i class="fa-solid fa-store"></i> ${st("marketBadge", "Market")}
            </a>
          `;
        }

        return `
          <div class="plugin-item">
            <div class="plugin-left">
              <span class="plugin-rank">#${p.rank}</span>
              <div>
                <span class="plugin-name">${p.name}</span>
                ${marketBadge}
              </div>
            </div>
            <div class="plugin-right">
              <span class="plugin-pct">${p.adoption_percentage.toFixed(1)}%</span>
              <span class="plugin-servers-count">${formatNumber(p.server_count)} ${st("serversCountUnit", "servers")}</span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // Set up event listeners
  function setupEvents() {
    const refreshBtn = document.getElementById("refresh-btn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        fetchTelemetryData();
      });
    }

    // Chart toggle buttons
    const chartBtns = document.querySelectorAll("[data-trend-mode]");
    chartBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        chartBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.trendMode = btn.getAttribute("data-trend-mode");

        const pLegend = document.getElementById("chart-legend-players");
        const sLegend = document.getElementById("chart-legend-servers");
        if (pLegend && sLegend) {
          if (state.trendMode === "players") {
            pLegend.style.display = "flex";
            sLegend.style.display = "none";
          } else {
            pLegend.style.display = "none";
            sLegend.style.display = "flex";
          }
        }

        renderChart();
      });
    });

    // Map toggle buttons
    const mapBtns = document.querySelectorAll("[data-map-mode]");
    mapBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        mapBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.mapMode = btn.getAttribute("data-map-mode");
        renderWorldMap();
      });
    });

    // Geo sort buttons
    const geoBtns = document.querySelectorAll("[data-geo-sort]");
    geoBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        geoBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.geoSort = btn.getAttribute("data-geo-sort");
        renderGeo();
      });
    });

    // Window resize handler for responsive chart
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        renderChart();
      }, 100);
    });

    // Re-render dynamic strings when the site language changes (i18n.js
    // already re-applies all static [data-i18n] markup at that point).
    window.addEventListener("pumpkin-lang-change", async () => {
      await loadStatsStrings();
      renderAll();
    });

    // Auto-refresh every 60 seconds
    setInterval(() => {
      fetchTelemetryData();
    }, 60000);
  }

  async function init() {
    setupEvents();
    await loadStatsStrings();
    renderWorldMap();
    fetchTelemetryData();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
