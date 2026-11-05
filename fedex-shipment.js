(() => {
  "use strict";

  const API = globalThis.FedExQuickFill;
  if (!API || !API.fillFields || !Array.isArray(API.presets)) {
    console.error("FedEx Quick-Fill: core files did not load.");
    return;
  }

  const TARGET_PATH = "/shippingplus/en-us/shipment/create";
  const HOST_ID = "fedex-quick-fill-host";
  const fixedFields = [
    { label: "Phone number", value: "8165952359" },
    { label: "Add shipment references", value: true },
    { label: "Pickup/drop-off", value: "I have already scheduled a pickup at my location" },
    { label: "Country/Territory", value: "United States" },
    { label: "Service", value: "FedEx Ground" }
  ];

  let activeRoute = false;
  let dismissedForCurrentVisit = false;
  let mountAttempt = 0;
  let lastHref = location.href;

  const isShipmentCreatePage = () => {
    try {
      return location.hostname === "www.fedex.com" && location.pathname.replace(/\/$/, "") === TARGET_PATH;
    } catch (_) {
      return false;
    }
  };

  function removePanel() {
    document.getElementById(HOST_ID)?.remove();
  }

  async function mountPanel() {
    if (document.getElementById(HOST_ID) || dismissedForCurrentVisit || !isShipmentCreatePage()) return;

    const thisAttempt = ++mountAttempt;
    // In FedEx Shipping Plus, the SPA route can change before Angular has
    // rendered the shipment form. Wait for the controls before showing UI.
    const ready = await API.waitForFields(fixedFields.map(field => field.label), 60_000);
    if (!ready || thisAttempt !== mountAttempt || !isShipmentCreatePage() || dismissedForCurrentVisit) {
      if (!ready && isShipmentCreatePage()) {
        console.warn("FedEx Quick-Fill: Shipment form did not finish loading; quick-fill menu was not shown.");
      }
      return;
    }

    let dragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "position:fixed;z-index:2147483647;top:16px;right:16px;touch-action:none;";
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .panel { box-sizing:border-box; width:250px; padding:12px; color:#1f2937;
        background:#fff; border:1px solid #cbd5e1; border-radius:10px;
        box-shadow:0 8px 28px rgba(0,0,0,.20); font:13px/1.4 Arial,sans-serif; }
      .heading { display:flex; justify-content:space-between; align-items:center;
        margin:0 0 8px; font-weight:700; font-size:14px; cursor:move;
        user-select:none; touch-action:none; }
      .hint { margin:0 0 9px; color:#64748b; font-size:11px; }
      button { box-sizing:border-box; display:block; width:100%; margin:6px 0; padding:9px;
        border:0; border-radius:6px; background:#4b1f6f; color:#fff;
        font:600 12px Arial,sans-serif; cursor:pointer; text-align:left; }
      button:hover { background:#35134f; }
      button:disabled { opacity:.6; cursor:wait; }
      .close { width:auto; margin:0; padding:2px 7px; background:#e5e7eb; color:#111827; }
      .status { min-height:15px; margin:7px 0 0; color:#475569; font-size:11px; }
    `;

    const panel = document.createElement("div");
    panel.className = "panel";
    const heading = document.createElement("div");
    heading.className = "heading";
    heading.append("Shipment Quick-Fill");

    const status = document.createElement("p");
    status.className = "status";
    status.setAttribute("aria-live", "polite");

    function dismiss() {
      dismissedForCurrentVisit = true;
      host.remove();
    }

    const closeButton = document.createElement("button");
    closeButton.className = "close";
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "Close quick-fill menu");
    closeButton.addEventListener("click", dismiss);
    heading.append(closeButton);
    heading.addEventListener("pointerdown", event => {
      if (event.target === closeButton || event.button !== 0) return;
      const rect = host.getBoundingClientRect();
      dragging = true;
      dragOffsetX = event.clientX - rect.left;
      dragOffsetY = event.clientY - rect.top;
      host.style.left = `${rect.left}px`;
      host.style.top = `${rect.top}px`;
      host.style.right = "auto";
      heading.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    heading.addEventListener("pointermove", event => {
      if (!dragging) return;
      const maxLeft = Math.max(0, window.innerWidth - host.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - host.offsetHeight);
      host.style.left = `${Math.min(maxLeft, Math.max(0, event.clientX - dragOffsetX))}px`;
      host.style.top = `${Math.min(maxTop, Math.max(0, event.clientY - dragOffsetY))}px`;
    });
    const stopDragging = () => { dragging = false; };
    heading.addEventListener("pointerup", stopDragging);
    heading.addEventListener("pointercancel", stopDragging);

    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Drag this panel by its title. Copy recipient details first, then choose a package preset.";
    panel.append(heading, hint);

    async function runPreset(preset, button) {
      button.disabled = true;
      status.textContent = "Reading clipboard and filling fields…";
      try {
        const addressFields = await API.readClipboardAddress();
        const returnField = { label: "Include a return label", value: preset.returnLabel === true };
        let results = API.fillFields([...fixedFields, ...addressFields, ...(preset.fields || []), returnField]);

        if (preset.returnDetails) {
          status.textContent = "Opening return details…";
          const tabReady = await API.waitForTextControl("Return details", 30_000);
          if (!tabReady || !API.clickTextControl("Return details")) {
            console.warn('FedEx Quick-Fill: Could not find the "Return details" tab.');
            status.textContent = "Return details tab not found; check it manually.";
          } else {
            const sameReady = await API.waitForFields(["Is the same as the outbound shipment"], 30_000);
            if (sameReady) {
              const returnResults = API.fillFields([
                { label: "Is the same as the outbound shipment", value: preset.returnDetails.sameAsOutbound === true },
                ...preset.returnDetails.fields
              ]);
              results = results.concat(returnResults);
            } else {
              console.warn('FedEx Quick-Fill: Return details controls did not appear.');
              status.textContent = "Return details did not finish loading; check them manually.";
            }
          }
        }

        // Put the cursor where the user should continue working. A street
        // address is considered present when at least one parsed Address line
        // contains a value; otherwise return focus to Contact Name.
        const hasAddress = addressFields.some(field =>
          /^address line [123]$/i.test(field.label || "") && String(field.value ?? "").trim()
        );
        const nextField = hasAddress ? "Shipment Reference" : "Contact name";
        if (!API.focusField(nextField)) {
          console.warn(`FedEx Quick-Fill: Could not focus the "${nextField}" field.`);
        }

        const filled = results.filter(result => result.status === "filled").length;
        const skipped = results.length - filled;
        console.info(`FedEx Quick-Fill: "${preset.label}" filled ${filled} field(s); ${skipped} field(s) need attention.`, results);
        status.textContent = `Filled ${filled}; ${skipped} need attention. Review shipment.`;
      } catch (error) {
        console.error("FedEx Quick-Fill error:", error);
        status.textContent = "Could not complete. See browser console.";
      } finally {
        button.disabled = false;
        dismiss();
      }
    }

    for (const preset of API.presets) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = preset.label;
      button.addEventListener("click", () => runPreset(preset, button));
      panel.append(button);
    }

    panel.append(status);
    shadow.append(style, panel);
    document.documentElement.append(host);

    const results = API.fillFields(fixedFields);
    const failed = results.filter(result => result.status !== "filled");
    if (failed.length) {
      console.warn("FedEx Quick-Fill: Some fixed fields could not be auto-filled. Review them manually.", failed);
    } else {
      console.info("FedEx Quick-Fill: Automatically populated all fixed shipment fields.");
    }
  }

  function checkRoute() {
    const href = location.href;
    const currentTarget = isShipmentCreatePage();
    if (href === lastHref && currentTarget === activeRoute) return;
    lastHref = href;

    if (!currentTarget) {
      if (activeRoute) {
        mountAttempt++;
        removePanel();
        dismissedForCurrentVisit = false;
      }
      activeRoute = false;
      return;
    }

    if (!activeRoute) {
      activeRoute = true;
      dismissedForCurrentVisit = false;
      mountPanel();
    }
  }

  // FedEx Shipping Plus is a single-page application. A content script that
  // matches only the create URL is never injected when the user reaches that
  // route through in-app navigation after login. This script is injected on
  // the Shipping Plus area and watches the SPA URL for route transitions.
  window.addEventListener("popstate", checkRoute);
  window.addEventListener("hashchange", checkRoute);
  const routeWatcher = new MutationObserver(checkRoute);
  routeWatcher.observe(document.documentElement, { childList: true, subtree: true });
  const routePoll = window.setInterval(checkRoute, 500);
  window.addEventListener("pagehide", () => {
    window.clearInterval(routePoll);
    routeWatcher.disconnect();
  }, { once: true });

  checkRoute();
})();
