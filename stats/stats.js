(function () {
  "use strict";

  const API_BASE = "https://market.pumpkinmc.org/api/v1/rest/telemetry";
  let state = {
    overview: null,
    trends: [],
    systems: null,
    geo: [],
    plugins: [],
    trendRange: "24h", // '24h' | '7d' | '30d' | '90d' | 'all'
    trendMode: "players", // 'players' | 'servers'
    mapMode: "servers", // 'servers' | 'players'
    geoSort: "servers", // 'servers' | 'players'
    lastFetchTime: null,
    isLoading: false,
    expanded: {
      os: false,
      cpu: false,
      plugins: false,
      geo: false,
    },
  };

  // Format numbers with locale commas
  function formatNumber(num) {
    if (num === null || num === undefined) return "0";
    return Number(num).toLocaleString();
  }

  // Format relative minutes ago
  function formatMinutesAgo(mins) {
    if (mins === undefined || mins === null) return "Unknown";
    if (mins <= 1) return "Active just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hours}h ${rem}m ago` : `${hours}h ago`;
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

  function formatAxisTimestamp(isoStr, range) {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      if (range === "24h") {
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      } else if (range === "7d") {
        return (
          d.toLocaleDateString([], { month: "short", day: "numeric" }) +
          " " +
          d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        );
      } else {
        return d.toLocaleDateString([], { month: "short", day: "numeric" });
      }
    } catch {
      return isoStr;
    }
  }

  function formatFullDateTime(isoStr) {
    if (!isoStr) return "Never";
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
          fetch(`${API_BASE}/trends?range=${encodeURIComponent(state.trendRange)}`).then((r) => (r.ok ? r.json() : [])),
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

  // Fetch only trends for rapid range switching
  async function fetchTrendsOnly() {
    const wrap = document.getElementById("chart-wrap");
    if (wrap) wrap.style.opacity = "0.4";

    try {
      const res = await fetch(`${API_BASE}/trends?range=${encodeURIComponent(state.trendRange)}`);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json)) {
          state.trends = json;
          renderChart();
        }
      }
    } catch (err) {
      console.error("Failed to update trends:", err);
    } finally {
      if (wrap) wrap.style.opacity = "1";
    }
  }


  // Render everything
  function renderAll() {
    renderKPIs();
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
      timeEl.textContent = "Connecting...";
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
        <span style="opacity: 0.8; font-size: 0.8rem;">(${formatNumber(o.live_servers)} live now)</span>
      `;
    }

    // Peak 24h Players
    const peakPlayersEl = document.getElementById("kpi-peak-players");
    if (peakPlayersEl) peakPlayersEl.textContent = formatNumber(o.peak_24h_players);

    const currentPlayersEl = document.getElementById("kpi-current-players");
    if (currentPlayersEl) {
      currentPlayersEl.innerHTML = `
        <i class="fa-solid fa-user-group" style="color: var(--color-green);"></i>
        <strong>${formatNumber(o.total_online_players)}</strong> online right now
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
          <span>Top region: <span class="iso-badge">${topCountry.country}</span> <strong>${topCountry.country_name}</strong></span>
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
          <span>${formatNumber(o.total_tracked_plugins)} modules detected</span>
        `;
      } else {
        pluginsSubEl.textContent = "";
      }
    }
  }

  let mapInstance = null;

  // Render World Map using jsVectorMap
  function renderWorldMap() {
    const container = document.getElementById("map-container");
    if (!container) return;
    if (typeof jsVectorMap === "undefined") {
      container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><div>Initializing map engine...</div></div>`;
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
                <span>Servers:</span>
                <strong>${formatNumber(item.servers)} (${item.percentage.toFixed(1)}%)</strong>
              </div>
              <div class="map-tooltip-row">
                <span>Player Traffic:</span>
                <strong>${formatNumber(item.players)} players</strong>
              </div>
              <div class="map-tooltip-row">
                <span>Density:</span>
                <strong>${avgPerNode} players / node</strong>
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
                <span>No active telemetry nodes</span>
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
      mapTotalGeo.textContent = `${geo.length} Active Regions`;
    }
    if (mapTotalPlayers) {
      const sumPlayers = geo.reduce((acc, g) => acc + g.players, 0);
      mapTotalPlayers.textContent = formatNumber(sumPlayers);
    }
    if (mapAvgDensity) {
      const sumS = geo.reduce((acc, g) => acc + g.servers, 0);
      const sumP = geo.reduce((acc, g) => acc + g.players, 0);
      mapAvgDensity.textContent = sumS > 0 ? `${(sumP / sumS).toFixed(1)} / node` : "0 / node";
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
          No telemetry trend data available
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
        const timeStr = formatAxisTimestamp(d.timestamp, state.trendRange);
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
              Online: <strong>${formatNumber(point.online_players)}</strong>
            </div>
            <div class="tip-val" style="color: #6c92ff; font-size: 0.8rem; margin-top: 2px;">
              <span class="node-dot" style="background: #4169e1;"></span>
              Peak: <strong>${formatNumber(point.peak_players)}</strong>
            </div>
          `;
        } else {
          content += `
            <div class="tip-val" style="color: #ff6b2c;">
              <span class="node-dot pumpkin-dot"></span>
              Active Total: <strong>${formatNumber(point.active_servers)}</strong>
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

    const rangeLabelMap = {
      "24h": "24h",
      "7d": "7d",
      "30d": "30d",
      "90d": "90d",
      "all": "Lifetime",
    };
    const rangeLabel = rangeLabelMap[state.trendRange] || state.trendRange;

    const peakLabelEl = document.getElementById("chart-sum-peak-label");
    const avgLabelEl = document.getElementById("chart-sum-avg-label");
    const minLabelEl = document.getElementById("chart-sum-min-label");
    if (peakLabelEl) peakLabelEl.textContent = `${rangeLabel} Peak`;
    if (avgLabelEl) avgLabelEl.textContent = `${rangeLabel} Average`;
    if (minLabelEl) minLabelEl.textContent = `${rangeLabel} Low`;
  }

  // Render Systems & Hardware Distributions
  function renderSystems() {
    const s = state.systems;
    if (!s) return;

    function renderDistList(containerId, items, accentClass = "", limit = null, stateKey = null) {
      const container = document.getElementById(containerId);
      if (!container) return;

      if (!items || items.length === 0) {
        container.innerHTML = `<div class="empty-state">No distribution data reported</div>`;
        return;
      }

      const isExpanded = Boolean(stateKey && state.expanded[stateKey]);
      const hasLimit = limit !== null && items.length > limit;
      const displayItems = hasLimit && !isExpanded ? items.slice(0, limit) : items;

      const itemsHtml = displayItems
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

      let toggleBtnHtml = "";
      if (hasLimit) {
        const remaining = items.length - limit;
        toggleBtnHtml = `
          <button type="button" class="see-more-btn" data-toggle-expand="${stateKey}" aria-expanded="${isExpanded}">
            ${isExpanded ? 'See less <i class="fa-solid fa-chevron-up"></i>' : `See more (+${remaining}) <i class="fa-solid fa-chevron-down"></i>`}
          </button>
        `;
      }

      container.innerHTML = itemsHtml + toggleBtnHtml;
    }

    renderDistList("dist-os", s.os, "", 5, "os");
    renderDistList("dist-arch", s.arch, "accent-blue");
    renderDistList("dist-software", s.software_versions, "accent-green");
    renderDistList("dist-mc", s.minecraft_versions, "accent-yellow");
    renderDistList("dist-ram", s.ram_distribution, "accent-purple");
    renderDistList("dist-total-ram", s.total_ram_distribution, "accent-blue");
    renderDistList("dist-cpu", s.cpu_models, "", 10, "cpu");
  }

  // Render Geo Distribution
  function renderGeo() {
    const container = document.getElementById("geo-list");
    if (!container) return;

    let items = [...(state.geo || [])];
    if (items.length === 0) {
      container.innerHTML = `<div class="empty-state">No geolocation data reported</div>`;
      return;
    }

    if (state.geoSort === "players") {
      items.sort((a, b) => b.players - a.players);
    } else {
      items.sort((a, b) => b.servers - a.servers);
    }

    const limit = 10;
    const isExpanded = Boolean(state.expanded.geo);
    const hasLimit = items.length > limit;
    const displayItems = hasLimit && !isExpanded ? items.slice(0, limit) : items;

    const itemsHtml = displayItems
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
                <strong>${formatNumber(item.servers)}</strong> servers · <strong>${formatNumber(item.players)}</strong> players (${pct}%)
              </span>
            </div>
            <div class="dist-bar-track">
              <div class="dist-bar-fill" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      })
      .join("");

    let toggleBtnHtml = "";
    if (hasLimit) {
      const remaining = items.length - limit;
      toggleBtnHtml = `
        <button type="button" class="see-more-btn" data-toggle-expand="geo" aria-expanded="${isExpanded}">
          ${isExpanded ? 'See less <i class="fa-solid fa-chevron-up"></i>' : `See more (+${remaining}) <i class="fa-solid fa-chevron-down"></i>`}
        </button>
      `;
    }

    container.innerHTML = itemsHtml + toggleBtnHtml;
  }

  window.pumpkinStatsFocusCountry = function (code) {
    let target = document.getElementById(`geo-item-${code}`);
    if (!target && !state.expanded.geo) {
      state.expanded.geo = true;
      renderGeo();
      target = document.getElementById(`geo-item-${code}`);
    }
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
      container.innerHTML = `<div class="empty-state">No plugin telemetry reported</div>`;
      return;
    }

    const limit = 10;
    const isExpanded = Boolean(state.expanded.plugins);
    const hasLimit = items.length > limit;
    const displayItems = hasLimit && !isExpanded ? items.slice(0, limit) : items;

    const itemsHtml = displayItems
      .map((p) => {
        let marketBadge = "";
        if (p.market_plugin_id) {
          marketBadge = `
            <a href="https://market.pumpkinmc.org/" class="plugin-market-link" target="_blank" rel="noopener" title="Available on Marketplace">
              <i class="fa-solid fa-store"></i> Market
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
              <span class="plugin-servers-count">${formatNumber(p.server_count)} servers</span>
            </div>
          </div>
        `;
      })
      .join("");

    let toggleBtnHtml = "";
    if (hasLimit) {
      const remaining = items.length - limit;
      toggleBtnHtml = `
        <button type="button" class="see-more-btn" data-toggle-expand="plugins" aria-expanded="${isExpanded}">
          ${isExpanded ? 'See less <i class="fa-solid fa-chevron-up"></i>' : `See more (+${remaining}) <i class="fa-solid fa-chevron-down"></i>`}
        </button>
      `;
    }

    container.innerHTML = itemsHtml + toggleBtnHtml;
  }

  // Set up event listeners
  function setupEvents() {
    const refreshBtn = document.getElementById("refresh-btn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        fetchTelemetryData();
      });
    }

    // Chart range toggle buttons
    const rangeBtns = document.querySelectorAll("[data-trend-range]");
    rangeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const newRange = btn.getAttribute("data-trend-range");
        if (state.trendRange === newRange) return;
        rangeBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.trendRange = newRange;
        fetchTrendsOnly();
      });
    });

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

    // Delegated click handler for "See more" / "See less" buttons
    document.addEventListener("click", (e) => {
      const toggleBtn = e.target.closest("[data-toggle-expand]");
      if (!toggleBtn) return;
      const key = toggleBtn.getAttribute("data-toggle-expand");
      if (state.expanded && state.expanded[key] !== undefined) {
        const wasExpanded = state.expanded[key];
        state.expanded[key] = !wasExpanded;

        if (key === "plugins") {
          renderPlugins();
        } else if (key === "geo") {
          renderGeo();
        } else {
          renderSystems();
        }

        if (wasExpanded) {
          const card = toggleBtn.closest(".dist-card") || toggleBtn.closest(".stats-section");
          if (card) {
            const rect = card.getBoundingClientRect();
            if (rect.top < 0) {
              card.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }
        }
      }
    });

    // Window resize handler for responsive chart
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        renderChart();
      }, 100);
    });

    // Auto-refresh every 60 seconds
    setInterval(() => {
      fetchTelemetryData();
    }, 60000);
  }

  function init() {
    setupEvents();
    renderWorldMap();
    fetchTelemetryData();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
