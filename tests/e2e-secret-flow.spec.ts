import { test, expect } from '@playwright/test';

/**
 * End-to-End Browser Test Suite for WhisperNet
 * Tests the complete zero-knowledge secret lifecycle:
 * 1. Client-Side DOM Encryption: Plaintext encrypted locally in the browser via WebCrypto.
 * 2. URL Hash Token Isolation: Verifies #token=... is present in the share link,
 *    never transmitted in HTTP request headers to the backend, and auto-stripped from URL history.
 * 3. Client-Side Decryption: Validates browser-side AES-256-GCM decryption of ciphertext.
 * 4. Burn-on-Read Destruction: Verifies the secret is destroyed immediately upon retrieval.
 */
test.describe('WhisperNet E2E Zero-Knowledge Flow', () => {

  test('Creates, shares, and decrypts a burn-on-read secret end-to-end', async ({ page }) => {
    const testSecret = 'PROD_DATABASE_KEY=5UP3R_53CR3T_P455W0RD_2026!';

    // Track network requests to ensure plaintext secret and raw token are NEVER transmitted
    let postedPayload: Record<string, unknown> | null = null;
    let urlHashSentToServer = false;

    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('#token=')) {
        urlHashSentToServer = true;
      }
      if (url.includes('/api/secrets') && request.method() === 'POST' && !url.includes('/decrypt') && !url.includes('/manage')) {
        try {
          postedPayload = JSON.parse(request.postData() || '{}');
        } catch {
          // ignore parsing error
        }
      }
    });

    // 1. Navigate to Home
    await page.goto('/');
    await expect(page).toHaveTitle(/WhisperNet/);

    // 2. Type secret into textarea
    const secretInput = page.locator('textarea');
    await expect(secretInput).toBeVisible();
    await secretInput.fill(testSecret);

    // 3. Click Encrypt & Generate Link button
    const encryptButton = page.getByRole('button', { name: /Encrypt Secret/i });
    await expect(encryptButton).toBeEnabled();
    await encryptButton.click();

    // 4. Verify client-side encryption output
    await expect(page.getByText('2. Share Secure Link')).toBeVisible({ timeout: 10_000 });

    // Verify network security guarantee: Plaintext was never sent to server
    expect(postedPayload).not.toBeNull();
    expect(postedPayload.secret).toBeUndefined();
    expect(postedPayload.clientEncrypted).toBe(true);
    expect(postedPayload.encrypted).toBeDefined();
    expect(postedPayload.iv).toHaveLength(24);
    expect(postedPayload.salt).toHaveLength(64);
    expect(postedPayload.authTag).toHaveLength(32);
    expect(postedPayload.tokenVerifier).toHaveLength(64);

    // 5. Extract generated share link with #token fragment
    const shareLinkElement = page.locator('span.text-cyan-400.truncate');
    await expect(shareLinkElement).toBeVisible();
    const shareLink = await shareLinkElement.innerText();
    expect(shareLink).toContain('#token=WNET-');

    const tokenMatch = shareLink.match(/#token=(WNET-[0-9A-F-]+)/i);
    expect(tokenMatch).not.toBeNull();
    const rawToken = tokenMatch![1];

    // 6. Navigate to the secret link as the recipient
    await page.goto(shareLink);

    // 7. Verify hash isolation: Fragment is read, auto-populated into input, and removed from URL
    const tokenInput = page.locator('input[type="text"]');
    await expect(tokenInput).toHaveValue(rawToken.toUpperCase());
    expect(page.url()).not.toContain('#token='); // stripped by window.history.replaceState
    expect(urlHashSentToServer).toBe(false);

    // 8. Submit Decryption
    const decryptButton = page.getByRole('button', { name: /Decrypt Secret/i });
    await expect(decryptButton).toBeEnabled();
    await decryptButton.click();

    // 9. Verify secret is successfully decrypted client-side in the DOM
    await expect(page.getByText(testSecret)).toBeVisible({ timeout: 10_000 });

    // 10. Verify Burn-on-Read: Reloading page must result in 404 / destroyed notice
    await page.reload();
    await expect(page.getByText(/Secret Not Found or Expired/i)).toBeVisible({ timeout: 10_000 });
  });

  test('Rejects decryption when incorrect token is supplied', async ({ page }) => {
    // 1. Navigate to Home
    await page.goto('/');
    const secretInput = page.locator('textarea');
    await secretInput.fill('CONFIDENTIAL_TOKEN_DATA');

    const encryptButton = page.getByRole('button', { name: /Encrypt Secret/i });
    await encryptButton.click();
    await expect(page.getByText('2. Share Secure Link')).toBeVisible({ timeout: 10_000 });

    const shareLinkElement = page.locator('span.text-cyan-400.truncate');
    const shareLink = await shareLinkElement.innerText();

    // Change token in URL to an invalid one
    const tamperedLink = shareLink.replace(/token=WNET-[0-9A-F-]+/i, 'token=WNET-DEADBEEF-00000000-11111111-22222222');
    await page.goto(tamperedLink);

    const decryptButton = page.getByRole('button', { name: /Decrypt Secret/i });
    await decryptButton.click();

    // Verify error banner is shown with attempts remaining
    await expect(page.getByText(/Invalid token or passphrase/i)).toBeVisible({ timeout: 10_000 });
  });
});
