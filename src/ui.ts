// Small helpers for building DOM without a framework.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, unknown>> = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = String(v);
    else if (k === "html") node.innerHTML = String(v);
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (v !== undefined && v !== null && v !== false) {
      node.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export const DISCLAIMER_HTML =
  "<strong>Not a medical diagnosis.</strong> This is a screening and education tool only. It does not detect or rule out RAPD, optic neuropathy, or any condition. For clinical concern, refer to an ophthalmologist.";

export function disclaimerBanner(): HTMLElement {
  return el("div", { class: "disclaimer", html: DISCLAIMER_HTML });
}
