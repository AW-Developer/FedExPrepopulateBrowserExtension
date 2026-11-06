(() => {
  "use strict";

  const normalize = value => String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s*\*\s*\(Required\)\s*/i, " ")
    .replace(/\s*\(Required\)\s*/i, " ")
    .replace(/\s*\*/g, "")
    .trim()
    .toLowerCase();

  function findByLabel(labelText) {
    const wanted = normalize(labelText);
    // FedEx uses different visible captions for these two address fields
    // across versions/locales of Shipping Plus.
    const aliases = {
      "state or province": ["state or province", "state", "province", "state/province"],
      "postal code": ["postal code", "zip code", "zip/postal code", "zip"]
    };
    const accepted = aliases[wanted] || [wanted];
    const labels = [...document.querySelectorAll("label")];
    const visible = node => !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
    const matches = labels.filter(node => accepted.some(alias =>
      normalize(node.textContent) === alias || normalize(node.textContent).startsWith(alias + " ")
    ));
    matches.sort((a, b) => Number(visible(b)) - Number(visible(a)));
    const label = matches[0];

    if (label) {
      const id = label.htmlFor || label.getAttribute("for");
      if (id) return document.getElementById(id);
      const wrapper = label.closest("ui-checkbox, input-text-field, input-select, input-search, input-sanitised, input-address-search, input");
      const found = wrapper?.querySelector("input, select, textarea");
      if (found) return found;
    }

    // FedEx's dimension controls use aria-label rather than individual <label>s.
    const ariaMatch = [...document.querySelectorAll("input[aria-label], select[aria-label], textarea[aria-label]")]
      .find(node => accepted.some(alias => normalize(node.getAttribute("aria-label")) === alias) && visible(node));
    return ariaMatch || null;
  }

  function focusField(labelText) {
    const element = findByLabel(labelText);
    if (!element || element.disabled || element.readOnly) return false;
    element.focus({ preventScroll: false });
    if (typeof element.select === "function" && element.tagName === "INPUT") {
      // Keep the caret ready for typing without selecting existing content.
      const end = String(element.value ?? "").length;
      try { element.setSelectionRange(end, end); } catch (_) {}
    }
    return document.activeElement === element;
  }

  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : element instanceof HTMLInputElement ? HTMLInputElement.prototype
      : null;
    const setter = prototype && Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, String(value));
    else if ("value" in element) element.value = String(value);
    else element.textContent = String(value);
  }

  function fillOne(element, value) {
    if (!element) return false;
    if (element.disabled || element.readOnly) return false;

    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      element.checked = value === true || value === "true" || value === 1;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    if (element instanceof HTMLInputElement && element.type === "radio") {
      const radios = element.name
        ? [...document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`)]
        : [element];
      const match = radios.find(radio => String(radio.value) === String(value))
        || radios.find(radio => normalize(radio.labels?.[0]?.textContent) === normalize(value));
      if (!match) return false;
      match.checked = true;
      match.dispatchEvent(new Event("input", { bubbles: true }));
      match.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    if (element instanceof HTMLSelectElement) {
      const wanted = String(value);
      const option = [...element.options].find(item => item.value === wanted)
        || [...element.options].find(item => normalize(item.textContent) === normalize(wanted));
      if (!option) return false;
      setNativeValue(element, option.value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    // FedEx's recipient fields are Angular-controlled inputs (ng-pristine /
    // ng-untouched in the supplied page snapshot). Use the native prototype
    // setter, then emit the same bubbling input/change/blur sequence its
    // ControlValueAccessor listens for. A plain Event("input") alone can be
    // insufficient for sanitized/masked controls.
    element.focus({ preventScroll: true });
    const previousValue = element.value;
    const nextValue = String(value ?? "");
    setNativeValue(element, nextValue);
    try {
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: "insertText",
        data: nextValue
      }));
    } catch (_) {
      element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
    if (previousValue !== nextValue) {
      element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    }
    // Blur marks Angular controls touched and allows validation/sanitization
    // handlers to run before the user submits the form.
    element.dispatchEvent(new FocusEvent("blur", { bubbles: false }));
    element.blur();
    return true;
  }

  function waitForFields(labels, timeoutMs = 60_000) {
    const allPresent = () => labels.every(label => !!findByLabel(label));
    if (allPresent()) return Promise.resolve(true);

    return new Promise(resolve => {
      let finished = false;
      const finish = result => {
        if (finished) return;
        finished = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve(result);
      };
      const observer = new MutationObserver(() => {
        if (allPresent()) finish(true);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      const timer = setTimeout(() => finish(allPresent()), timeoutMs);
      // Close the small race between the initial check and observer registration.
      if (allPresent()) finish(true);
    });
  }

  function clickTextControl(text) {
    const wanted = normalize(text);
    const candidates = [...document.querySelectorAll('button, [role="tab"], [role="button"], a, [tabindex]')];
    const target = candidates.find(node => normalize(node.textContent) === wanted &&
      (node.offsetWidth || node.offsetHeight || node.getClientRects().length));
    if (!target) return false;
    target.click();
    return true;
  }

  function waitForTextControl(text, timeoutMs = 30_000) {
    const wanted = normalize(text);
    const exists = () => [...document.querySelectorAll('button, [role="tab"], [role="button"], a, [tabindex]')]
      .some(node => normalize(node.textContent) === wanted && (node.offsetWidth || node.offsetHeight || node.getClientRects().length));
    if (exists()) return Promise.resolve(true);
    return new Promise(resolve => {
      let finished = false;
      const finish = result => { if (finished) return; finished = true; observer.disconnect(); clearTimeout(timer); resolve(result); };
      const observer = new MutationObserver(() => { if (exists()) finish(true); });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      const timer = setTimeout(() => finish(exists()), timeoutMs);
      if (exists()) finish(true);
    });
  }

  function fillFields(fieldValues) {
    if (!Array.isArray(fieldValues)) {
      throw new TypeError("fillFields expects an array of { label, value } objects.");
    }

    const results = fieldValues.map(item => {
      if (!item || (typeof item.label !== "string" && typeof item.selector !== "string")) {
        return { label: item?.label ?? item?.selector ?? "(missing)", status: "invalid configuration" };
      }
      const element = item.selector
        ? [...document.querySelectorAll(item.selector)].filter(node => !item.visibleOnly || node.offsetWidth || node.offsetHeight || node.getClientRects().length)[item.occurrence || 0]
        : findByLabel(item.label);
      const resultLabel = item.label || item.selector;
      if (!element) return { label: resultLabel, status: "field not found" };
      const success = fillOne(element, item.value);
      return {
        label: resultLabel,
        status: success ? "filled" : (element.disabled ? "disabled" : "value not available")
      };
    });

    console.table(results);
    return results;
  }

  // FedEx limits both recipient name fields to 35 characters. Only
  // abbreviate when a value exceeds that limit, preserving normal names.
  function fitRecipientName(value) {
    let result = String(value ?? "").trim();
    if (result.length <= 35) return result;

    result = result
      .replace(/\s*-\s*/g, "-")
      .replace(/\bCompany\b/gi, "Comp")
      .replace(/\bMedical\b/gi, "Med")
      .replace(/\bCenter\b/gi, "ctr");

    if (result.length > 35) {
      console.warn(`FedEx Quick-Fill: Recipient name remains ${result.length} characters after the requested abbreviations (FedEx limit: 35):`, result);
    }
    return result;
  }

  // Clipboard parsing supports two common layouts:
  //   Attn: Person / Company / optional department / numbered street / City ST ZIP
  //   Contact / Company / numbered street / optional street lines / City ST ZIP
  // The first numbered line is always Address line 1. Extra lines between the
  // company header and that numbered line are treated as additional address
  // lines (for example, a building or pavilion name).
  function parseClipboardAddress(text) {
    const lines = String(text ?? "").replace(/\r/g, "").split("\n").map(line => line.trim()).filter(Boolean);
    if (!lines.length) return [];

    // The final line must be a city, two-letter state, and ZIP/ZIP+4.
    const localityIndex = lines.length - 1;
    const localityMatch = lines[localityIndex].match(/^(.*?)\s*,?\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (!localityMatch || !localityMatch[1].trim()) {
      console.warn("FedEx Quick-Fill: Final clipboard line is not City ST ZIP:", lines[localityIndex]);
      return [];
    }

    // Find the first line beginning with a number; this is the primary street line.
    const addressStart = lines.findIndex((line, index) => index < localityIndex && /^\d/.test(line));
    if (addressStart < 0) return [];

    const header = lines.slice(0, addressStart);
    const numberedAddressLines = lines.slice(addressStart, localityIndex);
    let contactName = "";
    let company = "";
    let extraAddressLines = [];

    // An Attn header explicitly identifies the contact. The next line is the
    // company; any remaining pre-street line(s) are building/address details.
    const hasAttn = /^attn\s*:/i.test(header[0] || "");
    if (hasAttn) {
      contactName = header[0].replace(/^attn\s*:\s*/i, "").trim();
      company = header[1] || "";
      extraAddressLines = header.slice(2);
    } else if (header.length === 1) {
      contactName = company = header[0];
    } else if (header.length === 2) {
      contactName = header[0];
      company = header[1];
    } else if (header.length > 2) {
      // For an unmarked multi-line header, keep the first two name lines and
      // interpret the rest as building/address lines rather than losing them.
      contactName = header[0];
      company = header[1];
      extraAddressLines = header.slice(2);
    }

    // Preserve the requested three-line minimum for ordinary address blocks.
    // An Attn/contact + company + building-name + numbered-street pattern is
    // the useful exception: the building name becomes Address line 2, as in
    // "Medical Pavilion" above "1111 Example Avenue".
    const addressLineCount = numberedAddressLines.length + extraAddressLines.length;
    const attnBuildingException = hasAttn && extraAddressLines.length > 0 && numberedAddressLines.length >= 1;
    if (addressLineCount < 3 && !attnBuildingException) {
      console.info("FedEx Quick-Fill: Fewer than three address lines found; treating clipboard address as blank.");
      return [];
    }

    const addressLines = numberedAddressLines.slice();
    // The numbered street is line 1; pre-street building names follow it.
    addressLines.splice(1, 0, ...extraAddressLines);

    const values = [];
    if (contactName) values.push({ label: "Contact name", value: fitRecipientName(contactName) });
    if (company) values.push({ label: "Company", value: fitRecipientName(company) });
    ["Address line 1", "Address line 2", "Address line 3"].forEach((label, index) => {
      if (addressLines[index]) values.push({ label, value: addressLines[index] });
    });
    values.push({ label: "City", value: localityMatch[1].trim().replace(/,\s*$/, "") });
    values.push({ label: "State or province", value: localityMatch[2].toUpperCase() });
    values.push({ label: "Postal code", value: localityMatch[3] });
    return values;
  }

  async function readClipboardAddress() {
    try {
      const text = await navigator.clipboard.readText();
      return parseClipboardAddress(text);
    } catch (error) {
      console.warn("FedEx Quick-Fill: Clipboard could not be read. Check the extension clipboardRead permission and browser access.", error);
      return [];
    }
  }

  globalThis.FedExQuickFill = globalThis.FedExQuickFill || {};
  globalThis.FedExQuickFill.clickTextControl = clickTextControl;
  globalThis.FedExQuickFill.waitForTextControl = waitForTextControl;
  globalThis.FedExQuickFill.fillFields = fillFields;
  globalThis.FedExQuickFill.focusField = focusField;
  globalThis.FedExQuickFill.waitForFields = waitForFields;
  globalThis.FedExQuickFill.parseClipboardAddress = parseClipboardAddress;
  globalThis.FedExQuickFill.fitRecipientName = fitRecipientName;
  globalThis.FedExQuickFill.readClipboardAddress = readClipboardAddress;
})();
