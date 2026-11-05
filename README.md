# FedEx Shipment Quick-Fill

## Install in Edge
1. Extract this folder into a permanent location, such as `Documents`.
2. Open `edge://extensions`.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select this folder.
5. After updating an existing install, click **Reload** on the extension and refresh the FedEx shipment page.

The extension requests `clipboardRead` so preset buttons can read copied recipient details.

## Automatic fixed fields
After the shipment form finishes rendering, the extension attempts to set:
- Phone number: `8165952359`
- Add shipment references: checked
- Pickup/drop-off: `I have already scheduled a pickup at my location`
- Country/Territory: United States
- Service: FedEx Ground

## Package buttons
All buttons also apply the fixed values above and any nonblank recipient details read from the clipboard.

| Button | Outbound weight | Outbound dimensions | Return label |
|---|---:|---:|---|
| Hag Chair | 40 lb | 27 × 22 × 20 in | Unchecked |
| X-Small Pkg (6x6) | 1 lb | 6 × 6 × 6 in | Unchecked |
| Small Pkg (8x8) | 2 lb | 8 × 8 × 8 in | Unchecked |
| Sturup-kit | 20 lb | 15 × 12 × 12 in | Checked |

For **Sturup-kit**, the extension additionally attempts to:
1. Open the **Return details** tab.
2. Uncheck **Is the same as the outbound shipment**.
3. Set the return package to **4 lb** and **12 × 8 × 6 in**.

## Clipboard format
Copy six lines in this order. Leave blank lines for fields you want to omit:

```text
Contact Name
Company
Address Line 1
Address Line 2
Address Line 3
City ST ZIP
```

Example:

```text
Jane Smith
ABC Company
123 Main Street
Suite 200

Kansas City MO 64108
```

The final line is parsed as City, two-letter State, and ZIP code. Clipboard content is read when you click a package button and is not stored by the extension.

## Important notes
- Weight and dimensions are entered in pounds and inches.
- The supplied HTML was a snapshot. It did not include the dynamically revealed **Return details** controls, so the Sturup-kit return-tab interaction is implemented using visible tab and label text but must be verified on the live FedEx page.
- FedEx may change its page structure or wording. Check all fields—including the return shipment—before submitting.
- The extension does not click Save, Ship, or Finalize.


### Latest interaction updates
- Recipient text fields now use the native input value setter followed by a bubbling `InputEvent`, `change`, and blur sequence to notify FedEx's Angular form controls.
- The floating panel no longer disappears after 10 seconds or when you type. It stays visible until you choose a package preset or click **X**.
- Drag the panel by its title bar to move it out of the way.
- Dropdowns and checkboxes retain their existing selection behavior.

Please verify the recipient fields show as accepted by FedEx before submitting. FedEx may change its validation behavior, and this extension does not submit shipments.


## Clipboard recipient format (v0.1.1)

The first nonblank line is either `Attn: Contact Name` or the company name. Without `Attn:`, Contact Name and Company are both set to the first line. The final nonblank line must be `City ST ZIP` (ZIP+4 is supported). Any nonblank lines between these are assigned to Address line 1, 2, and 3; blank lines are ignored.


Recipient name length handling: Contact Name and Company are left unchanged at 35 characters or fewer. If either exceeds 35 characters, spaces around hyphens are removed and the words `Company`, `Medical`, and `Center` are abbreviated to `Comp`, `Med`, and `ctr` respectively. If those requested substitutions still do not bring a name under 35 characters, the extension logs a warning rather than silently truncating the name.

### Single-page navigation support (v0.1.4)
- The content script now loads throughout the FedEx Shipping Plus area, not only when the shipment-create URL is the initial page.
- It watches in-app URL changes after login and mounts Quick-Fill when navigation reaches the shipment-create route, without requiring a browser refresh.
- The menu appears only after the shipment form controls are present. Navigating away removes the menu; returning to the create route mounts it again.


### Cursor placement (v0.1.5)
After a package preset is applied, focus moves to **Shipment Reference** when at least one street-address line was parsed from the clipboard. If no street-address line was supplied, focus moves to **Contact Name** so the recipient details can be entered manually.
