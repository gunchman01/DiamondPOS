# v0.3.57 native receipt path

359 regressions pass, including native dialog/selected Star/no custom dimensions/no measurement and receipt-only guard. Typecheck/build checked before commit. Physical Windows/Star output remains unverified.

- Use Test receipt using Windows dialog in Printing settings. Confirm a visible receipt and native dialog appear; select Star72mm x Receipt and print.
- If successful, enable/save Windows receipt dialog option and reprint a saved receipt; no duplicate payment.
- Unchecked saved option retains explicit measured silent receipt sizes. Label and Letter defaults remain unchanged.
- Check cancel and timeout paths before retrying; do not infer physical success from print-finished log.
- If native output is blank too, gather visible receipt rendering and driver version before changing code again.
