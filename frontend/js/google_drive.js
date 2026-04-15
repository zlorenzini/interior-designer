/**
 * google_drive.js — Google Drive Picker integration
 *
 * Loads the Google Drive Picker API and lets users choose files from Drive.
 * The selected file is downloaded via the backend or returned as a Drive file ID.
 *
 * Configuration — set before this script loads, e.g. in a <script> block:
 *
 *   window.APP_CONFIG = {
 *     googleClientId: 'YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com',
 *     googleApiKey:   'YOUR_API_KEY',  // for Picker API
 *     googleAppId:    'YOUR_PROJECT_NUMBER',
 *   };
 */

const GDrive = (() => {
  let _pickerInited = false;
  let _tokenClient = null;
  let _accessToken = null;

  const cfg = () => window.APP_CONFIG || {};

  function _isConfigured() {
    return !!(cfg().googleClientId && cfg().googleApiKey && cfg().googleAppId);
  }

  /** Dynamically load the GAPI and GIS scripts if not already present. */
  function _loadScripts() {
    const promises = [];
    if (!window.gapi) {
      promises.push(new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://apis.google.com/js/api.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      }));
    }
    if (!window.google?.accounts) {
      promises.push(new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      }));
    }
    return Promise.all(promises);
  }

  async function _initGapi() {
    await new Promise(resolve => gapi.load('picker', resolve));
    _pickerInited = true;
  }

  function _initTokenClient() {
    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: cfg().googleClientId,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      callback: () => {}, // overridden per-call
    });
  }

  function _getToken() {
    return new Promise((resolve, reject) => {
      _tokenClient.callback = (resp) => {
        if (resp.error) reject(new Error(resp.error));
        else { _accessToken = resp.access_token; resolve(_accessToken); }
      };
      _tokenClient.requestAccessToken({ prompt: _accessToken ? '' : 'consent' });
    });
  }

  /**
   * Open the Google Drive Picker.
   * @returns {Promise<{id: string, name: string, mimeType: string}|null>}
   */
  async function pickFile() {
    if (!_isConfigured()) {
      throw new Error(
        'Google Drive is not configured. ' +
        'Set window.APP_CONFIG.googleClientId, .googleApiKey, and .googleAppId.'
      );
    }

    await _loadScripts();
    if (!_pickerInited) await _initGapi();
    if (!_tokenClient) _initTokenClient();

    const token = await _getToken();

    return new Promise((resolve, reject) => {
      const picker = new google.picker.PickerBuilder()
        .addView(
          new google.picker.DocsView(google.picker.ViewId.DOCS_IMAGES)
            .setIncludeFolders(true)
        )
        .setOAuthToken(token)
        .setDeveloperKey(cfg().googleApiKey)
        .setAppId(cfg().googleAppId)
        .setCallback(data => {
          if (data.action === google.picker.Action.PICKED) {
            const doc = data.docs[0];
            resolve({ id: doc.id, name: doc.name, mimeType: doc.mimeType });
          } else if (data.action === google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();
      picker.setVisible(true);
    });
  }

  /**
   * Download a Drive file by ID via the backend proxy.
   * POST /api/images/drive-import { drive_file_id }
   */
  async function importFileViaBackend(driveFileId) {
    const res = await fetch(
      `${(window.APP_CONFIG?.apiBase) || 'http://localhost:8000/api'}/images/drive-import`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drive_file_id: driveFileId }),
      }
    );
    if (!res.ok) throw new Error(`Drive import failed: ${res.status}`);
    return res.json();
  }

  return { pickFile, importFileViaBackend, isConfigured: _isConfigured };
})();
