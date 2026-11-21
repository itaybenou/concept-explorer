/* LG-SAE concept graph explorer. Data: window.GRAPH from data/graph_data.js. */
(function () {
  "use strict";

  const G = window.GRAPH;
  const F = G.features;
  const main = document.querySelector("main");
  const panel = document.getElementById("panel");
  const content = document.getElementById("panel-content");
  let heatOpacity = 0.5;
  let fullPositions = null;
  let isolated = null;

  if (window.cytoscapeFcose) cytoscape.use(window.cytoscapeFcose);

  const maxStrength = Math.max(...G.edges.map((e) => e.strength));
  const elements = [
    ...G.nodes.map((n) => ({ data: { ...n, size: nodeSize(n) }, classes: n.type })),
    ...G.edges.map((e) => ({
      data: { id: `${e.source}->${e.target}`, ...e, w: 1 + 5 * Math.sqrt(e.strength / maxStrength) },
    })),
  ];

  function nodeSize(n) {
    return n.type === "global" ? 26 + 5 * Math.sqrt(n.n_connections) * 3 : 14 + 4 * Math.sqrt(n.n_connections);
  }

  const cy = cytoscape({
    container: document.getElementById("cy"),
    elements,
    minZoom: 0.05,
    maxZoom: 4,
    wheelSensitivity: 0.25,
    style: [
      {
        selector: "node",
        style: {
          width: "data(size)", height: "data(size)",
          label: "data(label)", color: "#e6e8ee", "font-size": 9,
          "text-valign": "bottom", "text-margin-y": 3,
          "text-outline-color": "#0f1117", "text-outline-width": 2,
          "min-zoomed-font-size": 7, "border-width": 1.5, "border-color": "#0f1117",
        },
      },
      { selector: "node.global", style: { "background-color": "#f5a524", "font-size": 12, "font-weight": 700, "min-zoomed-font-size": 5 } },
      { selector: "node.local", style: { "background-color": "#3fa7ff" } },
      {
        selector: "edge",
        style: {
          width: "data(w)", "line-color": "#5b6275", "target-arrow-color": "#7b8296",
          "target-arrow-shape": "triangle", "arrow-scale": 0.8, "curve-style": "bezier", opacity: 0.55,
        },
      },
      { selector: ".faded", style: { opacity: 0.08 } },
      { selector: "edge.highlight", style: { "line-color": "#8b7cff", "target-arrow-color": "#8b7cff", opacity: 0.95 } },
      { selector: "node.selected-node", style: { "border-width": 4, "border-color": "#ffffff" } },
      { selector: ".hidden-el", style: { display: "none" } },
    ],
  });

  const layoutOpts = {
    name: window.cytoscapeFcose ? "fcose" : "cose",
    quality: "default", randomize: true, animate: false,
    nodeRepulsion: () => 9000, idealEdgeLength: () => 70, edgeElasticity: () => 0.45,
    gravity: 0.3, gravityRange: 3.8, numIter: 2500, nodeSeparation: 60, packComponents: true,
  };

  setTimeout(() => {
    cy.layout(layoutOpts).run();
    fullPositions = {};
    cy.nodes().forEach((n) => { fullPositions[n.id()] = { ...n.position() }; });
    cy.fit(undefined, 30);
    document.getElementById("loading").style.display = "none";
    if (location.hash.length > 1 && F[location.hash.slice(1)]) openConcept(location.hash.slice(1));
  }, 20);

  // ---------------------------------------------------------------- search
  const datalist = document.getElementById("concept-list");
  const labelToId = {};
  Object.entries(F)
    .sort((a, b) => a[1].label.localeCompare(b[1].label))
    .forEach(([id, f]) => {
      const key = `${f.label} (${f.type} ${id})`;
      labelToId[key.toLowerCase()] = id;
      const opt = document.createElement("option");
      opt.value = key;
      datalist.appendChild(opt);
    });
  const search = document.getElementById("search");
  function runSearch() {
    const q = search.value.trim().toLowerCase();
    if (!q) return;
    let id = labelToId[q] || (F[search.value.trim().toUpperCase()] ? search.value.trim().toUpperCase() : null);
    if (!id) {
      const hit = Object.keys(labelToId).find((k) => k.includes(q));
      id = hit ? labelToId[hit] : null;
    }
    if (id) { openConcept(id); focusNode(id); }
  }
  search.addEventListener("change", runSearch);
  search.addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });

  // ---------------------------------------------------------------- graph interaction
  cy.on("tap", "node", (evt) => openConcept(evt.target.id()));
  cy.on("tap", (evt) => { if (evt.target === cy) closePanel(); });
  document.getElementById("close-panel").addEventListener("click", closePanel);
  document.getElementById("reset-btn").addEventListener("click", showFullGraph);

  function highlight(id) {
    const node = cy.getElementById(id);
    const hood = node.closedNeighborhood();
    cy.elements().removeClass("highlight selected-node").addClass("faded");
    hood.removeClass("faded");
    hood.edges().addClass("highlight");
    node.addClass("selected-node");
  }

  function clearHighlight() {
    cy.elements().removeClass("faded highlight selected-node");
  }

  function focusNode(id) {
    const node = cy.getElementById(id);
    if (node.empty() || node.hasClass("hidden-el")) return;
    cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 1.1) }, { duration: 350 });
  }

  function setPanelOpen(open) {
    panel.classList.toggle("hidden", !open);
    if (main.classList.contains("panel-open") === open) return;
    main.classList.toggle("panel-open", open);
    cy.resize();
  }

  function closePanel() {
    setPanelOpen(false);
    clearHighlight();
    history.replaceState(null, "", location.pathname);
  }

  function isolate(id) {
    const node = cy.getElementById(id);
    const sub = node.closedNeighborhood();
    cy.elements().addClass("hidden-el");
    sub.removeClass("hidden-el");
    isolated = id;
    sub.layout({
      name: "concentric", animate: true, animationDuration: 400, minNodeSpacing: 30,
      concentric: (n) => (n.id() === id ? 2 : 1), levelWidth: () => 1,
      padding: 60, startAngle: (3 / 2) * Math.PI,
    }).run();
    highlight(id);
    renderPanel(id);
  }

  function showFullGraph() {
    cy.elements().removeClass("hidden-el");
    isolated = null;
    if (fullPositions) {
      cy.nodes().positions((n) => fullPositions[n.id()]);
    }
    cy.fit(undefined, 30);
    const open = !panel.classList.contains("hidden") && content.dataset.id;
    if (open) { highlight(open); renderPanel(open); } else clearHighlight();
  }

  // ---------------------------------------------------------------- panel
  function openConcept(id) {
    if (!F[id]) return;
    if (isolated && cy.getElementById(id).hasClass("hidden-el")) showFullGraph();
    setPanelOpen(true);
    highlight(id);
    renderPanel(id);
    history.replaceState(null, "", `#${id}`);
  }

  function pct(x, digits = 2) { return `${(100 * x).toFixed(digits)}%`; }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function renderPanel(id) {
    const f = F[id];
    const isGlobal = f.type === "global";
    content.dataset.id = id;
    const other = isGlobal ? "local" : "global";
    const maxS = Math.max(...f.connections.map((c) => c.strength));

    const stats = isGlobal
      ? [
          [pct(f.frequency), "image frequency"],
          [f.n_connections, "local connections"],
        ]
      : [
          [pct(f.frequency, 1), "image frequency"],
          [pct(f.patch_frequency, 3), "patch frequency"],
          [f.n_connections, "global connections"],
        ];

    const images = f.top_images.map((t, i) => `
      <figure>
        <div class="img-wrap">
          <img src="${t.img}" alt="top ${i + 1}" loading="lazy">
          ${isGlobal ? "" : `<img class="heat" src="${t.heat}" style="opacity:${heatOpacity}" alt="">`}
        </div>
        <figcaption><b>#${i + 1}</b> ${esc(t.class_name)}<br>${isGlobal
          ? `activation = ${t.activation.toFixed(2)}`
          : `mean activation = ${t.activation.toFixed(3)}`}</figcaption>
      </figure>`).join("");

    const conns = f.connections.map((c) => `
      <li data-target="${c.id}" title="Strength = ${c.strength.toFixed(3)}, Bridge weight = ${c.C.toFixed(3)}">
        <div>
          <div class="name">${esc(c.label)}<span class="uid">${c.id}</span></div>
          <div class="bar ${other}" style="width:${Math.max(4, (100 * c.strength) / maxS)}%"></div>
        </div>
        <div class="meta">strength ${c.strength.toFixed(3)}</div>
      </li>`).join("");

    content.innerHTML = `
      <span class="kind ${f.type}">${f.type} concept</span><span class="unit">${isGlobal ? "Global" : "Local"} SAE unit ${f.unit_id}</span>
      <h2>${esc(f.label)}</h2>
      <p class="description">${esc(f.description)}</p>
      <div class="actions">
        ${isolated === id
          ? `<button id="unisolate-btn">Show full graph</button>`
          : `<button class="primary" id="isolate-btn">Isolate concept</button>`}
        <button id="focus-btn">Center in graph</button>
      </div>
      <h3>Concept info</h3>
      <div class="stats">${stats.map(([v, n]) => `<div class="stat"><div class="value">${v}</div><div class="name">${n}</div></div>`).join("")}</div>
      <h3>${isGlobal
        ? `Top-${f.top_images.length} activating images`
        : `Top-${f.top_images.length} images by mean patch activation, with activation maps`}</h3>
      ${isGlobal ? "" : `<div class="opacity-row">heatmap opacity <input type="range" id="opacity" min="0" max="1" step="0.05" value="${heatOpacity}"><span id="opacity-val">${heatOpacity.toFixed(2)}</span></div>`}
      <div class="images">${images}</div>
      <h3>Connected ${other} concepts (${f.n_connections}), by connection strength</h3>
      <ul class="connections">${conns}</ul>
      <p class="note">Strength: share of the bridge prediction for the global on images where it fires.</p>`;

    content.querySelectorAll(".connections li").forEach((li) =>
      li.addEventListener("click", () => { openConcept(li.dataset.target); focusNode(li.dataset.target); }));
    const iso = document.getElementById("isolate-btn");
    if (iso) iso.addEventListener("click", () => isolate(id));
    const uniso = document.getElementById("unisolate-btn");
    if (uniso) uniso.addEventListener("click", showFullGraph);
    document.getElementById("focus-btn").addEventListener("click", () => focusNode(id));
    const slider = document.getElementById("opacity");
    if (slider) {
      slider.addEventListener("input", () => {
        heatOpacity = parseFloat(slider.value);
        document.getElementById("opacity-val").textContent = heatOpacity.toFixed(2);
        content.querySelectorAll("img.heat").forEach((im) => { im.style.opacity = heatOpacity; });
      });
    }
    panel.scrollTop = 0;
  }
})();
