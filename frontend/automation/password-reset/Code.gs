// Copy this file into a standalone Apps Script project. No secrets in source.
function authorizeMail() {
  resetSettings_();
  return { configured: true, remainingRecipients: MailApp.getRemainingDailyQuota() };
}

function doGet() { return resetJson_({ ok: false }); }

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || raw.length > 2048) return resetJson_({ ok: false });
    var settings = resetSettings_();
    var envelope = JSON.parse(raw);
    if (!envelope || typeof envelope.payload !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.signature)) return resetJson_({ ok: false });
    var signature = Utilities.computeHmacSha256Signature(envelope.payload, settings.secret, Utilities.Charset.UTF_8)
      .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
    var mismatch = 0;
    for (var i = 0; i < 64; i++) mismatch |= signature.charCodeAt(i) ^ envelope.signature.charCodeAt(i);
    if (mismatch !== 0) return resetJson_({ ok: false });
    var data = JSON.parse(envelope.payload);
    var now = Date.now();
    if (!data || data.version !== 1 || !/^[a-f0-9]{32}$/.test(data.request_id)
      || !Number.isSafeInteger(data.issued_at) || Math.abs(now - data.issued_at) > 5 * 60 * 1000
      || typeof data.to !== 'string' || data.to.length > 255 || !/^[^\s<>,;:"\\]+@[^\s<>,;:"\\]+\.[^\s<>,;:"\\]+$/.test(data.to)
      || !/^[A-Za-z0-9_-]{24,128}$/.test(data.token) || data.origin !== settings.origin) return resetJson_({ ok: false });
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return resetJson_({ ok: false });
    try {
      now = Date.now();
      if (Math.abs(now - data.issued_at) > 5 * 60 * 1000) return resetJson_({ ok: false });
      var properties = PropertiesService.getScriptProperties();
      var key = 'resetDelivery_' + data.request_id;
      var previous = properties.getProperty(key);
      if (previous) {
        // Acknowledged repeats never send again. An uncertain/failed send is
        // never retried automatically: the user can request a fresh link.
        return resetJson_({ ok: JSON.parse(previous).state === 'sent', request_id: data.request_id });
      }
      var all = properties.getProperties();
      Object.keys(all).forEach(function (name) {
        if (/^resetDelivery_[a-f0-9]{32}$/.test(name)) {
          if (JSON.parse(all[name]).at < now - 10 * 60 * 1000) properties.deleteProperty(name);
        }
      });
      var day = new Date(now).toISOString().slice(0, 10);
      var count = properties.getProperty('resetMailDay') === day ? Number(properties.getProperty('resetMailCount') || '0') : 0;
      if (!Number.isSafeInteger(count) || count < 0 || count >= 20 || MailApp.getRemainingDailyQuota() < 1) return resetJson_({ ok: false });
      properties.setProperty('resetMailDay', day);
      properties.setProperty('resetMailCount', String(count + 1));
      properties.setProperty(key, JSON.stringify({ at: now, state: 'attempted' }));
      var link = settings.origin + '/reset-password#token=' + data.token;
      MailApp.sendEmail({
        to: data.to, name: settings.siteName,
        subject: '【' + settings.siteName + '】パスワードの再設定',
        body: settings.siteName + 'のパスワード再設定を受け付けました。\n\n'
          + '次のリンクを開き、30分以内に新しいパスワードを設定してください。\n' + link + '\n\n'
          + 'このリンクは1回だけ使えます。リンクの有効期限を過ぎた場合は、もう一度メールを依頼してください。\n\n'
          + '心当たりがない場合は、このメールを破棄してください。パスワードは変更されません。'
      });
      properties.setProperty(key, JSON.stringify({ at: now, state: 'sent' }));
      return resetJson_({ ok: true, request_id: data.request_id });
    } finally { lock.releaseLock(); }
  } catch (ignored) {
    // Never log incoming envelopes, recipients, tokens or Google exceptions.
    return resetJson_({ ok: false });
  }
}

function resetSettings_() {
  var properties = PropertiesService.getScriptProperties();
  var secret = properties.getProperty('PASSWORD_RESET_GAS_SECRET') || '';
  var origin = properties.getProperty('FRONTEND_URL') || '';
  var siteName = properties.getProperty('SITE_NAME') || '演習サービス';
  if (!/^[a-f0-9]{64}$/.test(secret) || !/^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]*(?::[0-9]{1,5})?$/.test(origin)
    || siteName.length > 100 || /[\r\n\x00-\x1f]/.test(siteName)) throw new Error('Configuration unavailable');
  return { secret: secret, origin: origin, siteName: siteName };
}

function resetJson_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
