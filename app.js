// MatchDB — read-only static snapshot. Loads baked datasets.json + meta.json and does all
// filtering/sorting client-side. No backend, no secrets, no harvest/enrich controls.

let ALL = [];
let sortField = "year";
let sortDesc = true;

const $ = (id) => document.getElementById(id);
const MATCH_LABELS = {
  cfdna_methylation: "cfDNA methylation",
  paired_tissue_plasma: "tissue+plasma",
  two_modalities: "two modalities",
  unknown: "unknown",
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function prov(d, key) {
  const p = (d.deep_extracted || {})[key];
  if (!p || (p.source == null && p.confidence == null)) return "";
  const bits = [p.source, p.confidence != null ? `conf ${p.confidence}` : ""].filter(Boolean).join(" · ");
  return ` title="${escapeHtml(bits)}"`;
}

function filtered() {
  const q = $("f-q").value.trim().toLowerCase();
  const cancer = $("f-cancer").value.trim().toLowerCase();
  const assay = $("f-assay").value.trim().toLowerCase();
  const cohort = parseInt($("f-cohort").value, 10);
  const source = $("f-source").value;
  const match = $("f-match").value;
  const access = $("f-access").value;
  const cfdna = $("f-cfdna").checked;
  const meth = $("f-meth").checked;
  const stage = $("f-stage").value.trim().toLowerCase();
  const treatment = $("f-treatment").value.trim().toLowerCase();
  const methassay = $("f-methassay").value.trim().toLowerCase();
  const timeseries = $("f-timeseries").checked;
  const cfdnaconc = $("f-cfdnaconc").checked;

  let rows = ALL.filter((d) => {
    if (q && !`${d.title} ${d.summary || ""} ${d.primary_accession}`.toLowerCase().includes(q)) return false;
    if (cancer && !(d.cancer_type || []).some((c) => (c || "").toLowerCase().includes(cancer))) return false;
    if (assay && !(d.assay_type || "").toLowerCase().includes(assay)) return false;
    if (!isNaN(cohort) && !((d.cohort_size ?? -1) >= cohort)) return false;
    if (source && d.source !== source) return false;
    if (match && d.match_type !== match) return false;
    if (access && d.access_tier !== access) return false;
    if (cfdna && !d.has_cfdna) return false;
    if (meth && !d.has_methylation) return false;
    if (stage && !(d.cancer_stage || "").toLowerCase().includes(stage)) return false;
    if (treatment && !(d.treatment_type || []).some((t) => (t || "").toLowerCase().includes(treatment))) return false;
    if (methassay && !(d.methylation_assay || "").toLowerCase().includes(methassay)) return false;
    if (timeseries && d.time_series !== true) return false;
    if (cfdnaconc && d.cfdna_concentration_ng_ml == null) return false;
    return true;
  });

  const dir = sortDesc ? -1 : 1;
  rows.sort((a, b) => {
    const av = a[sortField], bv = b[sortField];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;   // nulls last
    if (bv == null) return -1;
    return av < bv ? -dir : av > bv ? dir : 0;
  });
  return rows;
}

function render() {
  const rows = filtered();
  const tbody = $("rows");
  tbody.innerHTML = "";
  for (const d of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="title">${escapeHtml(d.title || d.primary_accession)}</td>
      <td>${escapeHtml(d.first_author || "")}</td>
      <td><span class="tag">${d.source}</span></td>
      <td class="mono">${(d.accessions || []).slice(0, 4).join(", ")}</td>
      <td>${(d.cancer_type || []).join(", ")}</td>
      <td class="num">${d.cohort_size ?? (d.sample_count ?? "")}</td>
      <td>${escapeHtml(d.assay_type || "")}</td>
      <td${prov(d, "methylation_assay")}>${escapeHtml(d.methylation_assay || "")}</td>
      <td${prov(d, "cancer_stage")}>${escapeHtml(d.cancer_stage || "")}</td>
      <td${prov(d, "treatment_type")}>${escapeHtml((d.treatment_type || []).join(", "))}</td>
      <td${prov(d, "time_series")}>${d.time_series === true ? "yes" : d.time_series === false ? "no" : ""}</td>
      <td class="num"${prov(d, "avg_reads")}>${d.avg_reads ?? ""}</td>
      <td class="num"${prov(d, "cfdna_concentration_ng_ml")}>${d.cfdna_concentration_ng_ml ?? ""}</td>
      <td><span class="match match-${d.match_type}">${MATCH_LABELS[d.match_type] || d.match_type}</span></td>
      <td><span class="access access-${d.access_tier}">${d.access_tier}</span></td>
      <td class="num">${d.year ?? ""}</td>
      <td>${d.download_url ? `<a href="${d.download_url}" target="_blank" rel="noopener">open</a>` : ""}</td>`;
    tbody.appendChild(tr);
  }
  $("total-count").textContent = `${rows.length} of ${ALL.length} shown`;
}

function fillSelect(id, counts, labels = {}) {
  const sel = $(id);
  sel.innerHTML = `<option value="">any</option>`;
  for (const [k, n] of Object.entries(counts || {})) {
    const opt = document.createElement("option");
    opt.value = k; opt.textContent = `${labels[k] || k} (${n})`;
    sel.appendChild(opt);
  }
}
function section(title, counts, labels = {}) {
  const items = Object.entries(counts || {}).map(([k, n]) => `<li><span>${labels[k] || k}</span><b>${n}</b></li>`).join("");
  return items ? `<div class="facet-group"><h4>${title}</h4><ul>${items}</ul></div>` : "";
}

async function main() {
  const [datasets, meta] = await Promise.all([
    fetch("./datasets.json").then((r) => r.json()),
    fetch("./meta.json").then((r) => r.json()).catch(() => ({})),
  ]);
  ALL = datasets;
  const f = meta.facets || {};
  fillSelect("f-source", f.source);
  fillSelect("f-match", f.match_type, MATCH_LABELS);
  fillSelect("f-access", f.access_tier);
  $("facets").innerHTML = `<h3>Overview (${meta.total ?? ALL.length})</h3>` +
    section("By source", f.source) +
    section("By match type", f.match_type, MATCH_LABELS) +
    section("Top cancers", f.cancer_type);
  if (meta.generated) $("snapshot").textContent = `snapshot ${meta.generated}`;
  render();
}

document.querySelectorAll("th[data-sort]").forEach((th) => {
  th.style.cursor = "pointer";
  th.addEventListener("click", () => {
    const field = th.dataset.sort;
    if (sortField === field) sortDesc = !sortDesc;
    else { sortField = field; sortDesc = true; }
    render();
  });
});
$("apply-btn").addEventListener("click", render);
$("f-q").addEventListener("keypress", (e) => { if (e.key === "Enter") render(); });
$("reset-btn").addEventListener("click", () => {
  ["f-q", "f-cancer", "f-assay", "f-cohort", "f-stage", "f-treatment", "f-methassay"].forEach((id) => ($(id).value = ""));
  ["f-source", "f-match", "f-access"].forEach((id) => ($(id).value = ""));
  ["f-cfdna", "f-meth", "f-timeseries", "f-cfdnaconc"].forEach((id) => ($(id).checked = false));
  render();
});

main();
