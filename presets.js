(() => {
  "use strict";
  globalThis.FedExQuickFill = globalThis.FedExQuickFill || {};

  const packageFields = (weight, length, width, height) => [
    { label: "Weight 1", value: String(weight) },
    { label: "Dimensions Length", value: String(length) },
    { label: "Dimensions Width", value: String(width) },
    { label: "Dimensions Height", value: String(height) },
    { selector: 'select[id$="-suffix-input"]', value: "lb", visibleOnly: true },
    { selector: 'select[data-test-id="dimensions-suffix-select"]', value: "in", visibleOnly: true }
  ];

  globalThis.FedExQuickFill.presets = [
    { label: "Hag Chair", fields: packageFields(40, 27, 22, 20), returnLabel: false },
    { label: "X-Small Pkg (6x6)", fields: packageFields(1, 6, 6, 6), returnLabel: false },
    { label: "Small Pkg (8x8)", fields: packageFields(2, 8, 8, 8), returnLabel: false },
    {
      label: "Sturup-kit",
      fields: packageFields(22, 24, 6, 8),
      returnLabel: true,
      returnDetails: {
        sameAsOutbound: false,
        fields: packageFields(4, 12, 8, 6)
      }
    }
  ];
})();
