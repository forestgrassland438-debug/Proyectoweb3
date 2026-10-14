/* Authenticated LitVM impact panel. All chain indexing and exports live in the backend. */
(function (global) {
  'use strict';
  var BASE = '/api/admin/impact';
  var SUMMARY_INTERVAL = 45000;
  var SCAN_INTERVAL = 8000;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function number(value, digits, lang) {
    if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '—';
    if (typeof value === 'string' && /^\d+$/.test(value) && !Number.isSafeInteger(Number(value))) {
      try { return BigInt(value).toLocaleString(lang || 'es-EC'); } catch (_) { return value; }
    }
    return Number(value).toLocaleString(lang || 'es-EC', { maximumFractionDigits: digits == null ? 0 : digits });
  }
  function timestamp(value, lang) {
    if (!value) return '—';
    var d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(lang || 'es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'medium', timeStyle: 'short' });
  }
  function duration(seconds) {
    if (seconds == null || !Number.isFinite(Number(seconds))) return '—';
    var total = Math.floor(Math.max(0, Number(seconds)));
    var hours = Math.floor(total / 3600), minutes = Math.floor(total % 3600 / 60);
    return hours ? number(hours) + ' h ' + minutes + ' min' : minutes ? minutes + ' min' : total + ' s';
  }
  function shortHash(hash) { return hash ? String(hash).slice(0, 10) + '…' + String(hash).slice(-8) : '—'; }
  function cleanText(value) { return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''); }
  function txUrl(base, hash) {
    if (!/^0x[0-9a-f]{64}$/i.test(String(hash || ''))) return null;
    try {
      var url = new URL(base);
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      return url.href.replace(/\/$/, '') + '/' + encodeURIComponent(hash);
    } catch (_) { return null; }
  }
  function running(scan) { return scan && /^(running|scanning|starting|retrying|queued)$/i.test(scan.status || ''); }
  function diagnosticText(diagnostic, previousError) {
    diagnostic = diagnostic || {};
    if (String(diagnostic.code) === '14031' || diagnostic.codeName === 'OutOfDiskSpace' || /^14031(?:\b|:)/.test(String(previousError || ''))) {
      return 'MongoDB respondió 14031 (OutOfDiskSpace): la operación no dispone del espacio libre requerido; la conexión puede seguir disponible. En Railway, contrasta el disco que ve MongoDB con el volumen y la reserva mínima de índices. Un error guardado puede ser anterior. Consulta el diagnóstico actual antes de ampliar el volumen y vuelve a intentar analizarCC tras resolver la causa.';
    }
    var text = diagnostic.message || previousError;
    if (!text) return '';
    return String(text) + (diagnostic.stage ? ' · Etapa: ' + diagnostic.stage : '');
  }
  function qualityNotes(summary) {
    var notes = (summary.quality && summary.quality.notes || []).map(function (n) {
      return typeof n === 'string' ? n : n.message || n.note || JSON.stringify(n);
    });
    if (summary.playtime && summary.playtime.coverageNote) notes.push(summary.playtime.coverageNote);
    if (summary.contract && summary.contract.userAttributionNote) notes.push(summary.contract.userAttributionNote);
    return Array.from(new Set(notes.filter(Boolean)));
  }
  function englishNote(note) {
    var translations = [
      [/^totalTransactions cuenta/, 'Contract volume counts unique canonical mined hashes: successful plus reverted. Pending and signed transactions without receipts are separate.'],
      [/^txCount por jugador/, 'Player txCount, action counts and transactions per hour include only successful canonical transactions attributed to the actor; multiple events and secondary participants do not add transactions.'],
      [/^El promedio Tx\/usuario/, 'Transactions per active user uses successful transactions from the last 30 days attributed to players active in that same window.'],
      [/^Las etiquetas de actividad/, 'Activity labels are statistical indicators and do not certify that an account is human.'],
      [/^Las métricas representan/, 'Metrics cover records already indexed. Historical volume remains partial until analizarCC covers the deployment history.'],
      [/^Los datos de Mongo/, 'Database and RPC metrics are read over a short interval; an atomic snapshot across services is not guaranteed.'],
      [/^Tiempo acumulado medido/, 'Accumulated playtime covers existing counters: socket measurement when available, saved-game intervals as an estimated fallback, without adding both sources. Average session length includes only new authenticated segments since instrumentation began. On-chain history cannot reconstruct earlier playtime. Legacy counters may include simultaneous browser tabs.'],
      [/^Una tx se atribuye/, 'A transaction is attributed only to an unambiguously identified backend actor. Recipients, ambiguous candidates and system writes are not counted as another player’s generated actions.'],
      [/^Actor exacto:/, 'Exact actor attribution requires an authenticated backend caller or a directly registered on-chain sender. Inventory ownership recovered from events or calldata is a separate inferred association; it does not prove who initiated the operation. Recipients, ambiguous candidates and system writes are not counted as another player’s generated actions.'],
      [/^inferredTransactions e inferredTxCount/, 'Inferred transaction counts preserve historical associations with inventory owners without attributing authorship of the actions to those owners.'],
      [/^El desglose usa gameplayAction/, 'Action labels use authenticated gameplay context when available. Historical records without that context retain the technical contract function name; generic invoice operations do not establish woodcutting or mining.']
    ];
    for (var i = 0; i < translations.length; i++) if (translations[i][0].test(note)) return translations[i][1];
    return note;
  }
  function buildReport(summary, language, community) {
    var en = language !== 'es', lang = en ? 'en-US' : 'es-EC';
    var users = summary.users || {}, play = summary.playtime || {}, contract = summary.contract || {}, relayer = summary.relayer || {};
    var retention = users.retention7d || {};
    function n(value, digits) { return number(value, digits, lang); }
    function field(label, value) { return label + ': ' + cleanText(value == null || value === '' ? (en ? 'Not available' : 'No disponible') : value); }
    var cohort = retention.percent == null ? (en ? 'Not available for an exact eligible cohort.' : 'No disponible para una cohorte elegible exacta.') : n(retention.percent, 2) + '% (' + n(retention.returning) + '/' + n(retention.eligible) + ')';
    var notes = qualityNotes(summary).map(function (note) { return en ? englishNote(note) : note; });
    var retentionMethod = en && /^D7 por cuenta registrada:/.test(retention.definition || '')
      ? 'D7 counts a registered account as returning when an observed gameplay segment overlaps [registration + 7 days, registration + 8 days). Eligible registrations are 15 to 8 days old and occur after instrumentation began; cohorts without eight complete days of observation are excluded.'
      : retention.definition;
    var out = [
      en ? 'GRASSLAND FOREST — LITVM IMPACT REPORT' : 'GRASSLAND FOREST — REPORTE DE IMPACTO LITVM',
      en ? 'Grant & Airdrop technical evidence' : 'Evidencia técnica para Grant y Airdrop',
      field(en ? 'Snapshot (America/Guayaquil)' : 'Instantánea (America/Guayaquil)', timestamp(summary.generatedAt, lang)),
      '',
      en ? '1. EXECUTIVE TRACTION SUMMARY' : '1. RESUMEN EJECUTIVO DE TRACCIÓN',
      field(en ? 'Registered backend accounts' : 'Cuentas registradas en el backend', n(users.registered)),
      field(en ? 'Active players — last 24 hours' : 'Jugadores activos — últimas 24 horas', n(users.active24h)),
      field(en ? 'Active players — last 7 days' : 'Jugadores activos — últimos 7 días', n(users.active7d)),
      field(en ? 'Active players — last 30 days' : 'Jugadores activos — últimos 30 días', n(users.active30d)),
      field(en ? 'Day-7 retention' : 'Retención D7', cohort),
      field(en ? 'Retention methodology' : 'Metodología de retención', retentionMethod || (en ? 'Requires timestamped session history; active accounts divided by registrations is not retention.' : 'Requiere historial de sesiones; dividir activos entre registros no mide retención.')),
      field(en ? 'Accumulated recorded playtime (hours)' : 'Tiempo de juego acumulado registrado (horas)', n(play.totalHours, 3)),
      field(en ? 'Average observed session (minutes)' : 'Promedio de sesión observada (minutos)', n(play.averageSessionMinutes, 2)),
      field(en ? 'Observed sessions' : 'Sesiones observadas', n(play.sessionCount)),
      field(en ? 'Playtime source' : 'Fuente del tiempo de juego', play.source),
      field(en ? 'Playtime coverage' : 'Cobertura del tiempo de juego', en && play.coverageNote ? englishNote(play.coverageNote) : play.coverageNote),
      field(en ? 'Session instrumentation began' : 'Inicio de instrumentación de sesiones', play.sessionCoverageStartedAt),
      '',
      en ? '2. GASLESS RELAYER ARCHITECTURE' : '2. ARQUITECTURA GASLESS RELAYER',
      en
        ? 'Grassland Forest uses one game smart contract. The backend authenticates player accounts and submits sponsored game operations through the Relayer wallet below, which pays network gas in zkLTC. This offers a low-friction experience without requiring each player to fund a wallet for each sponsored operation.'
        : 'Grassland Forest utiliza un único contrato inteligente de juego. El backend autentica a los jugadores y envía operaciones patrocinadas mediante la wallet Relayer indicada abajo, que paga el gas en zkLTC. La experiencia evita que cada jugador deba financiar su wallet para cada operación patrocinada.',
      field(en ? 'Relayer wallet' : 'Wallet Relayer', relayer.address),
      field(en ? 'Registered backend accounts represented by the system' : 'Cuentas registradas representadas por el sistema', n(users.registered)),
      field(en ? 'Players with attributed transaction evidence' : 'Jugadores con evidencia de transacciones atribuidas', n(users.withAttributedTransactions != null ? users.withAttributedTransactions : contract.attributedUserCount)),
      field(en ? 'Registered players with successful sponsorship by the current Relayer' : 'Jugadores registrados patrocinados con éxito por el Relayer actual', n(relayer.sponsoredUniqueRegisteredPlayers)),
      field(en ? 'Successful sponsored transactions — current Relayer' : 'Transacciones patrocinadas exitosas — Relayer actual', n(relayer.sponsoredSuccessfulTransactions)),
      en ? 'Sponsorship figures apply only to the current Relayer wallet. Older rotated wallets may appear in contract totals but are not claimed as sponsorship by this address.' : 'Las cifras de patrocinio corresponden solo a la wallet Relayer actual. Las wallets anteriores pueden aparecer en el total del contrato, pero no se presentan como patrocinio de esta dirección.',
      en
        ? 'Registered accounts identify distinct backend records; they do not establish distinct humans, distinct on-chain wallets, or that every registered account has used the Relayer. The audit joins authenticated backend actor records and decoded contract evidence to transaction hashes. Unattributed historical transactions remain unattributed rather than being assigned to a player by assumption.'
        : 'Las cuentas registradas identifican registros distintos del backend; no prueban personas distintas, wallets on-chain distintas ni que todas las cuentas hayan usado el Relayer. La auditoría cruza registros de actores autenticados y evidencia decodificada del contrato con los hashes. Las transacciones históricas sin atribución permanecen sin atribuir, sin asignar un jugador por suposición.',
      '',
      en ? '3. SINGLE-CONTRACT METRICS' : '3. MÉTRICAS DEL CONTRATO ÚNICO',
      field(en ? 'Contract address' : 'Dirección del contrato', contract.address),
      field(en ? 'Chain ID' : 'Chain ID', contract.chainId),
      field(en ? 'Unique mined transaction volume (success + reverted)' : 'Volumen de transacciones minadas únicas (éxito + revertidas)', n(contract.totalTransactions)),
      field(en ? 'Successful transactions' : 'Transacciones exitosas', n(contract.confirmedTransactions)),
      field(en ? 'Reverted transactions' : 'Transacciones revertidas', n(contract.revertedTransactions)),
      field(en ? 'Pending transactions (excluded from mined volume)' : 'Transacciones pendientes (excluidas del volumen minado)', n(contract.pendingTransactions)),
      field(en ? 'Attributed transactions' : 'Transacciones atribuidas', n(contract.attributedTransactions)),
      field(en ? 'Inferred inventory-owner associations (initiator unverified)' : 'Asociaciones inferidas al inventario (origen no verificado)', n(contract.inferredTransactions)),
      field(en ? 'Unattributed transactions' : 'Transacciones sin atribución', n(contract.unattributedTransactions)),
      field(en ? 'Successful attributed tx per active player — last 30 days' : 'Tx exitosas atribuidas por jugador activo — últimos 30 días', n(contract.transactionsPerActiveUser, 3)),
      field(en ? 'Successful transactions used in the 30-day numerator' : 'Transacciones exitosas del numerador de 30 días', n(contract.activeWindowTransactions)),
      field(en ? 'Relayer gas balance (zkLTC)' : 'Saldo de gas Relayer (zkLTC)', relayer.balanceNative),
      field(en ? 'Relayer balance (wei, exact integer)' : 'Saldo Relayer (wei, entero exacto)', relayer.balanceWei),
      field(en ? 'Relayer latest / pending nonce' : 'Nonce Relayer minado / pendiente', n(relayer.nonceLatest) + ' / ' + n(relayer.noncePending)),
      field(en ? 'Unique signed Relayer transactions observed in the ledger' : 'Transacciones firmadas únicas del Relayer observadas en el ledger', n(relayer.ledgerSignedTransactions)),
      en ? 'The signed ledger count includes observed signed, pending, successful and reverted transactions for this contract, including recovered chain history. It does not represent every local signing attempt.' : 'El conteo de firmas incluye transacciones observadas firmadas, pendientes, exitosas y revertidas de este contrato, incluido el historial recuperado. No representa todos los intentos locales de firma.',
      en ? 'Nonce measures the sending wallet across all destinations. It is not the game contract transaction count, nor evidence of all transactions signed locally.' : 'El nonce mide la actividad de la wallet emisora para todos los destinos. No es el conteo de transacciones del contrato de juego ni una prueba de todas las transacciones firmadas localmente.',
      '',
      en ? '4. COMMUNITY GROWTH (ADMINISTRATOR-SUPPLIED)' : '4. CRECIMIENTO DE COMUNIDAD (APORTADO POR EL ADMINISTRADOR)',
      field(en ? 'Discord members — count and measurement date' : 'Miembros de Discord — cifra y fecha', community.discord || (en ? '[Add current metrics]' : '[Añadir métricas actuales]')),
      field(en ? 'X / Twitter followers — count and measurement date' : 'Seguidores de X / Twitter — cifra y fecha', community.twitter || (en ? '[Add current metrics]' : '[Añadir métricas actuales]')),
      field(en ? 'Growth period, sources and context' : 'Periodo de crecimiento, fuentes y contexto', community.context || (en ? '[Add links and growth context]' : '[Añadir enlaces y contexto de crecimiento]')),
      '',
      en ? '5. VERIFIABILITY AND COVERAGE' : '5. VERIFICABILIDAD Y COBERTURA',
      field(en ? 'Historical analysis status' : 'Estado del análisis histórico', summary.scan && summary.scan.status),
      en ? 'CSV evidence contains the full player audit and recorded hash history. JSON evidence contains the current contract, Relayer and coverage snapshot. Hashes can be checked on the configured LitVM explorer.' : 'La evidencia CSV incluye la auditoría completa de jugadores y el historial de hashes registrados. La evidencia JSON incluye la instantánea del contrato, del Relayer y su cobertura. Los hashes pueden verificarse en el explorador LitVM configurado.',
      field(en ? 'Transaction explorer base' : 'Base del explorador de transacciones', summary.explorerTxBase),
      en ? 'Counts use unique canonical transaction hashes. Successful player actions, reverted transactions and pending submissions are reported separately. Multiple decoded operations can belong to one transaction; their action counts should not be added to infer transaction volume.' : 'Los conteos utilizan hashes únicos de transacciones canónicas. Las acciones exitosas, revertidas y pendientes se presentan por separado. Varias operaciones decodificadas pueden pertenecer a una misma transacción; no se deben sumar las acciones para deducir el volumen de transacciones.',
      en ? 'Exact actor counts require an authenticated backend caller or a registered direct sender. Historical inventory-owner associations inferred from calldata or events are separate evidence: they do not establish the initiator, and are excluded from player action counts, transaction-per-hour ratios and organic activity indicators.' : 'Los conteos del actor requieren un caller autenticado del backend o un emisor directo registrado. Las asociaciones históricas a titulares de inventario inferidas desde calldata o eventos son evidencia separada: no establecen el origen y se excluyen de acciones del jugador, ratios de transacciones por hora e indicadores de actividad orgánica.',
      en ? 'Organic activity labels are behavioral indicators, not proof that accounts are human or eligible for any grant or airdrop. Previously unrecorded sessions cannot be reconstructed precisely from chain transactions.' : 'Las etiquetas de actividad orgánica son indicios de comportamiento; no prueban que las cuentas sean humanas ni elegibles para un grant o airdrop. Las sesiones que no se registraron antes no pueden reconstruirse con precisión a partir de transacciones de la cadena.'
    ];
    if (notes.length) out.push('', en ? 'Coverage notes:' : 'Notas de cobertura:', notes.map(function (note) { return '- ' + cleanText(note); }).join('\n'));
    return out.join('\n');
  }

  function create(options) {
    var $ = function (id) { return document.getElementById(id); };
    var active = false, epoch = 0, summary = null, page = 1, limit = 50, total = 0;
    var summaryTimer = null, scanTimer = null, searchTimer = null;
    var summaryWork = null, scanWork = null, userWork = null, refreshWork = null;
    var controllers = new Set(), userController = null, userRequestId = 0;
    var reportSummary = null, lastUsers = null, generatingReport = false;
    var scanStartDiagnostic = null;
    function controller() { var c = new AbortController(); controllers.add(c); return c; }
    function failure(e, message, expectedEpoch) {
      if (!active || expectedEpoch !== epoch || e.name === 'AbortError') return;
      if (e.status === 401 || e.code === 'not_admin') { options.onUnauthorized(); return; }
      options.notice(message + ': ' + (e.message || e), 'err');
    }
    function setText(id, value) { $(id).textContent = value == null || value === '' ? '—' : value; }
    function renderSummary(data) {
      var users = data.users || {}, play = data.playtime || {}, contract = data.contract || {}, relayer = data.relayer || {};
      var retention = users.retention7d || {};
      var cards = [
        ['Usuarios registrados', number(users.registered), 'Cuentas únicas del backend', true],
        ['Activos · 24 horas', number(users.active24h), 'Actividad registrada en las últimas 24 h'],
        ['Activos · 7 días', number(users.active7d), 'Actividad registrada en los últimos 7 días'],
        ['Activos · 30 días', number(users.active30d), 'Actividad registrada en los últimos 30 días'],
        ['Tiempo total · horas', number(play.totalHours, 2), 'Tiempo registrado acumulado', true],
        ['Sesión media · minutos', number(play.averageSessionMinutes, 2), number(play.sessionCount) + ' sesiones observadas · cobertura parcial'],
        ['Tx minadas · contrato', number(contract.totalTransactions), number(contract.confirmedTransactions) + ' exitosas · ' + number(contract.revertedTransactions) + ' revertidas', true],
        ['Tx / usuario activo · 30 d', number(contract.transactionsPerActiveUser, 3), 'Tx exitosas atribuidas de 30 días / activos de 30 días'],
        ['Tx pendientes', number(contract.pendingTransactions), 'Separadas del volumen minado'],
        ['Tx asociadas · inferencia', number(contract.inferredTransactions), 'Inventario relacionado · origen no verificado'],
        ['Tx sin atribución', number(contract.unattributedTransactions), 'No asignadas a un jugador por suposición'],
        ['Retención · D7', retention.percent == null ? '—' : number(retention.percent, 2) + '%', retention.percent == null ? 'Historial de cohortes insuficiente' : number(retention.returning) + ' / ' + number(retention.eligible) + ' jugadores elegibles']
      ];
      $('impactKpis').innerHTML = cards.map(function (c) {
        return '<div class="kpi"><span class="label">' + escapeHtml(c[0]) + '</span><div class="value' + (c[3] ? ' accent' : '') + '">' + escapeHtml(c[1]) + '</div><small class="detail">' + escapeHtml(c[2]) + '</small></div>';
      }).join('');
      setText('impactContract', contract.address); setText('impactRelayer', relayer.address);
      setText('impactGas', relayer.balanceNative); setText('impactNonce', number(relayer.nonceLatest) + ' / ' + number(relayer.noncePending));
      setText('impactSigned', number(relayer.ledgerSignedTransactions));
      setText('impactSponsored', number(relayer.sponsoredContractTransactions) + ' minadas · ' + number(relayer.sponsoredUniqueRegisteredPlayers) + ' jugadores con éxitos');
      setText('impactRelayerStatus', (relayer.status || 'Sin lectura') + ' · chain ' + (contract.chainId == null ? '—' : contract.chainId));
      setText('impactNonceNote', 'El nonce corresponde a toda la actividad de la wallet; el volumen del contrato se cuenta por hashes únicos. ' + (relayer.note || ''));
      setText('impactUpdated', 'Instantánea: ' + timestamp(data.generatedAt) + ' · actualización cada 45 s');
      var notes = qualityNotes(data);
      if (users.activeDefinition) notes.push('Usuarios activos: ' + users.activeDefinition);
      if (relayer.sponsorshipCoverage) notes.push(relayer.sponsorshipCoverage);
      notes.push('Firmas observadas: hashes únicos del Relayer actual guardados en el ledger para este contrato (firmadas, pendientes, exitosas o revertidas), incluido historial recuperado. No contabiliza todos los intentos locales de firma.');
      if (retention.definition) notes.push('Retención D7: ' + retention.definition);
      notes.push('— indica que la fuente no ofrece un valor verificable. Los ceros se muestran solamente cuando el backend los devuelve.');
      $('impactQuality').innerHTML = '<ul>' + notes.map(function (n) { return '<li>' + escapeHtml(n) + '</li>'; }).join('') + '</ul>';
      if (data.scan && !scanWork) renderScan(data.scan);
      if (lastUsers) renderUsers(lastUsers);
      ['impactExportCsv', 'impactExportJson', 'impactGenerate'].forEach(function (id) { $(id).disabled = false; });
    }
    function renderScan(scan) {
      scan = scan || {};
      var labels = { idle: 'Sin iniciar', running: 'Analizando en el backend', scanning: 'Analizando en el backend', starting: 'Preparando análisis', queued: 'En cola', retrying: 'Reintentando lectura RPC', completed: 'Análisis completado', complete: 'Análisis completado', failed: 'Análisis detenido con error', error: 'Análisis detenido con error · puedes reanudar con analizarCC', interrupted: 'Análisis interrumpido · puedes reanudar con analizarCC', paused: 'Análisis pausado', stopped: 'Análisis detenido' };
      setText('impactScanStatus', labels[scan.status] || scan.status || 'Sin estado disponible');
      if (/^(complete|completed)$/.test(scan.status || '') && scan.historyComplete === false) setText('impactScanStatus', 'Análisis completado · cobertura histórica parcial');
      $('analizarCC').disabled = running(scan);
      var detail = [];
      if (running(scan) || /^(complete|completed)$/.test(scan.status || '')) scanStartDiagnostic = null;
      var diagnostic = scanStartDiagnostic || scan.initializationDiagnostic || scan.errorDiagnostic || scan.legacyImportDiagnostic;
      var previousError = diagnostic ? null : (scan.lastError || scan.error || scan.legacyImportError);
      var reason = diagnosticText(diagnostic, previousError);
      if (reason && !running(scan) && !/^(complete|completed)$/.test(scan.status || '')) {
        setText('impactScanStatus', String(diagnostic && diagnostic.code) === '14031' || /^14031/.test(String(previousError || ''))
          ? 'Análisis bloqueado por falta de espacio en MongoDB' : 'Análisis pendiente de resolver un error');
      }
      if (scan.nextBlock != null) detail.push('Siguiente bloque: ' + number(scan.nextBlock));
      if (scan.targetBlock != null) detail.push('Objetivo: ' + number(scan.targetBlock));
      var processedBlocks = scan.processedBlocks != null ? scan.processedBlocks : scan.scannedBlocks;
      if (processedBlocks != null) detail.push('Lecturas de bloques procesadas: ' + number(processedBlocks));
      if (scan.indexedTransactions != null) detail.push('Tx indexadas: ' + number(scan.indexedTransactions));
      if (scan.confirmations != null) detail.push('Confirmaciones requeridas: ' + number(scan.confirmations));
      if (scan.updatedAt) detail.push('Guardado: ' + timestamp(scan.updatedAt));
      if (reason) detail.push(reason);
      if (scan.message) detail.push(scan.message);
      setText('impactScanDetail', detail.join(' · ') || 'El análisis lee la cadena y guarda el progreso en la base de datos. La cobertura histórica depende del RPC y la evidencia disponible.');
      var progress = scan.progressPercent;
      var startBlock = scan.fromBlock != null ? scan.fromBlock : scan.startBlock;
      if (progress == null && startBlock != null && scan.nextBlock != null && scan.targetBlock != null) {
        var count = Number(scan.targetBlock) - Number(startBlock) + 1;
        progress = count > 0 ? (Number(scan.nextBlock) - Number(startBlock)) / count * 100 : null;
      }
      $('impactScanProgress').hidden = progress == null || !Number.isFinite(Number(progress));
      if (!$('impactScanProgress').hidden) $('impactScanProgress').value = Math.min(100, Math.max(0, Number(progress)));
      clearTimeout(scanTimer);
      if (active) scanTimer = setTimeout(function () { loadScan(); }, running(scan) ? SCAN_INTERVAL : SUMMARY_INTERVAL);
    }
    function renderUsers(data) {
      page = Math.max(1, Number(data.page) || page); limit = Math.max(1, Number(data.limit) || 50); total = Number(data.total) || 0;
      var pages = Math.max(1, Math.ceil(total / limit)), rows = data.rows || [];
      setText('impactUserInfo', number(total) + ' jugadores · tx exitosas con evidencia atribuida');
      setText('impactPage', page + ' / ' + pages); $('impactPrev').disabled = page <= 1; $('impactNext').disabled = page * limit >= total;
      $('impactUserRows').innerHTML = rows.map(function (row) {
        var actions = Object.entries(row.actions || {}).map(function (entry) {
          return '<span class="impact-action">' + escapeHtml(entry[0]) + ': ' + escapeHtml(number(entry[1])) + '</span>';
        }).join('');
        var label = row.activityLabel || 'Evidencia insuficiente', warn = /revisar|insuficiente|review/i.test(label);
        var link = txUrl(summary && summary.explorerTxBase, row.lastTxHash);
        var hash = link ? '<a class="mono" href="' + escapeHtml(link) + '" target="_blank" rel="noopener noreferrer" title="' + escapeHtml(row.lastTxHash) + '">' + escapeHtml(shortHash(row.lastTxHash)) + ' ↗</a>' : '<span class="mono" title="' + escapeHtml(row.lastTxHash || '') + '">' + escapeHtml(shortHash(row.lastTxHash)) + '</span>';
        var associatedLink = txUrl(summary && summary.explorerTxBase, row.lastAssociatedTxHash);
        var associatedHash = row.lastAssociatedTxHash ? '<span class="impact-secondary">Asociada · origen no verificado</span>' + (associatedLink ? '<a class="mono" href="' + escapeHtml(associatedLink) + '" target="_blank" rel="noopener noreferrer" title="' + escapeHtml(row.lastAssociatedTxHash) + '">' + escapeHtml(shortHash(row.lastAssociatedTxHash)) + ' ↗</a>' : '<span class="mono">' + escapeHtml(shortHash(row.lastAssociatedTxHash)) + '</span>') : '';
        return '<tr><td><strong>' + escapeHtml(row.playerName || row.username || 'Sin nombre') + '</strong>' +
          '<span class="impact-secondary mono">ID: ' + escapeHtml(row.id == null ? '—' : row.id) + '</span>' +
          (row.username ? '<span class="impact-secondary">' + escapeHtml(row.username) + '</span>' : '') +
          '<span class="impact-secondary mono">' + escapeHtml(row.address || 'Sin billetera vinculada') + '</span></td>' +
          '<td>' + escapeHtml(timestamp(row.registeredAt)) + '<span class="impact-secondary">Última: ' + escapeHtml(timestamp(row.lastSeen)) + '</span></td>' +
          '<td class="num">' + escapeHtml(duration(row.playtimeSeconds)) + '<span class="impact-secondary">' + escapeHtml(number(row.sessionCount)) + ' sesiones</span></td>' +
          '<td class="num">' + escapeHtml(number(row.txCount)) + '<span class="impact-secondary">exitosas del actor · ' + escapeHtml(number(row.revertedTxCount)) + ' revertidas · ' + escapeHtml(number(row.pendingTxCount)) + ' pendientes</span>' +
          '<span class="impact-secondary">' + escapeHtml(number(row.inferredTxCount)) + ' asociadas al inventario · origen no verificado</span></td>' +
          '<td>' + (actions || '<span class="dim">Sin operaciones atribuidas</span>') + (row.technicalActionCount > 0 ? '<span class="impact-secondary" title="' + escapeHtml(row.actionBreakdownNote || '') + '">' + escapeHtml(number(row.technicalActionCount)) + ' tx con función técnica · contexto de juego no registrado</span>' : '') + '</td>' +
          '<td><span class="mono">' + escapeHtml(number(row.txPerHour, 2)) + ' tx/h</span><span class="impact-secondary"><span class="pill' + (warn ? ' warn' : '') + '">' + escapeHtml(label) + '</span></span>' +
          '<span class="impact-secondary">' + escapeHtml(row.activityReason || 'Indicio de comportamiento; no prueba que sea una persona.') + '</span></td>' +
          '<td>' + hash + associatedHash + '</td></tr>';
      }).join('') || '<tr><td colspan="7" class="empty">No hay jugadores que coincidan con la búsqueda.</td></tr>';
    }
    function loadSummary() {
      if (!active) return Promise.resolve();
      if (summaryWork) return summaryWork;
      var expectedEpoch = epoch, c = controller();
      $('impactRefresh').disabled = true;
      summaryWork = options.request(BASE + '/summary', { signal: c.signal }).then(function (data) {
        if (!active || epoch !== expectedEpoch) return;
        summary = data; renderSummary(data); return data;
      }).catch(function (e) {
        if (active && expectedEpoch === epoch && e.name !== 'AbortError') setText('impactUpdated', 'No se pudo actualizar; la última instantánea puede estar desactualizada.');
        failure(e, 'No se pudo cargar el impacto', expectedEpoch);
        return null;
      }).finally(function () {
        controllers.delete(c);
        if (expectedEpoch !== epoch) return;
        summaryWork = null; $('impactRefresh').disabled = false;
      });
      return summaryWork;
    }
    function loadUsers() {
      if (!active) return Promise.resolve();
      if (userController) { userController.abort(); controllers.delete(userController); }
      var c = controller(), expectedEpoch = epoch, requestId = ++userRequestId;
      userController = c;
      setText('impactUserInfo', 'Cargando auditoría…');
      var route = BASE + '/users?page=' + page + '&limit=' + limit + '&sort=' + encodeURIComponent($('impactSort').value) + '&q=' + encodeURIComponent($('impactQ').value.trim());
      userWork = options.request(route, { signal: c.signal }).then(function (data) {
        if (!active || expectedEpoch !== epoch || requestId !== userRequestId) return;
        lastUsers = data; renderUsers(data);
      }).catch(function (e) {
        if (requestId !== userRequestId) return;
        if (active && expectedEpoch === epoch && e.name !== 'AbortError') setText('impactUserInfo', 'La auditoría no se pudo actualizar.');
        failure(e, 'No se pudo cargar la auditoría', expectedEpoch);
      }).finally(function () {
        controllers.delete(c);
        if (requestId === userRequestId && expectedEpoch === epoch) { userWork = null; userController = null; }
      });
      return userWork;
    }
    function loadScan() {
      if (!active) return Promise.resolve();
      if (scanWork) return scanWork;
      var expectedEpoch = epoch, c = controller();
      scanWork = options.request(BASE + '/scan', { signal: c.signal }).then(function (data) {
        if (active && epoch === expectedEpoch) renderScan(data.scan || data);
      }).catch(function (e) {
        failure(e, 'No se pudo leer el progreso del análisis', expectedEpoch);
        if (active && epoch === expectedEpoch) { clearTimeout(scanTimer); scanTimer = setTimeout(loadScan, SUMMARY_INTERVAL); }
      }).finally(function () {
        controllers.delete(c); if (expectedEpoch === epoch) scanWork = null;
      });
      return scanWork;
    }
    async function startScan() {
      if (!active) return;
      var expectedEpoch = epoch, c = controller();
      $('analizarCC').disabled = true; setText('impactScanStatus', 'Solicitando análisis al backend…');
      scanStartDiagnostic = null;
      try {
        var data = await options.request(BASE + '/scan', { method: 'POST', body: JSON.stringify({}), signal: c.signal });
        if (!active || expectedEpoch !== epoch) return;
        renderScan(data.scan || data);
        options.notice('El análisis está en el backend; su progreso permanece guardado aunque cierres el panel.');
        await loadSummary();
      } catch (e) {
        if (active && epoch === expectedEpoch) {
          scanStartDiagnostic = e.diagnostic || { message: e.message };
          $('analizarCC').disabled = false;
          setText('impactScanStatus', 'No se pudo iniciar analizarCC');
          setText('impactScanDetail', diagnosticText(e.diagnostic, e.message) || 'Vuelve a consultar el estado del análisis.');
        }
        failure(e, 'No se pudo iniciar analizarCC', expectedEpoch);
      } finally { controllers.delete(c); }
    }
    async function download(path, id, filename, accept) {
      if (!active) return;
      var expectedEpoch = epoch, c = controller(), button = $(id);
      button.disabled = true;
      try {
        var csrf = options.csrf(), headers = { Accept: accept };
        if (csrf) headers['X-CSRF-Token'] = csrf;
        var response = await fetch(options.api(BASE + path), { credentials: 'include', mode: 'cors', headers: headers, signal: c.signal });
        if (!response.ok) {
          var body = await response.json().catch(function () { return {}; });
          var error = new Error(body.message || body.error || 'HTTP ' + response.status); error.status = response.status; error.code = body.error; throw error;
        }
        var blob = await response.blob();
        if (!active || expectedEpoch !== epoch) return;
        var url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
        options.notice('Exportación completa descargada desde el backend.');
      } catch (e) { failure(e, 'No se pudo exportar', expectedEpoch); }
      finally { controllers.delete(c); if (active && epoch === expectedEpoch) button.disabled = false; }
    }
    function renderReport() {
      if (!reportSummary) return;
      $('impactReportText').value = buildReport(reportSummary, $('impactReportLanguage').value, { discord: $('impactDiscord').value, twitter: $('impactTwitter').value, context: $('impactCommunity').value });
      setText('impactReportSnapshot', 'Instantánea: ' + timestamp(reportSummary.generatedAt));
    }
    async function generateReport() {
      if (!active || generatingReport) return;
      var expectedEpoch = epoch;
      generatingReport = true;
      $('impactGenerate').disabled = true; $('impactRegenerate').disabled = true;
      try {
        // Request an explicit fresh snapshot. A failed refresh must not silently generate a report from stale data.
        var data = await loadSummary();
        if (!data) return;
        if (!active || epoch !== expectedEpoch) return;
        summary = data; reportSummary = data; renderSummary(data); renderReport();
        $('impactReportPanel').classList.remove('hidden');
        $('impactReportPanel').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      } catch (e) { failure(e, 'No se pudo obtener una instantánea para el reporte', expectedEpoch); }
      finally { if (epoch === expectedEpoch) { generatingReport = false; if (active) { $('impactGenerate').disabled = false; $('impactRegenerate').disabled = false; } } }
    }
    async function copyReport() {
      var text = $('impactReportText').value;
      if (!active || !text) return;
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('clipboard_unavailable');
        await navigator.clipboard.writeText(text); options.notice('Reporte copiado.');
      } catch (_) {
        $('impactReportText').focus(); $('impactReportText').select();
        options.notice('Seleccioné el reporte; pulsa Ctrl+C para copiarlo.', 'warn');
      }
    }
    function printReport() {
      if (!active || !$('impactReportText').value) return;
      var popup = window.open('', '_blank');
      if (!popup) { options.notice('Permite la ventana de impresión para guardar el PDF.', 'warn'); return; }
      var doc = popup.document;
      doc.title = 'Grassland Forest · LitVM Impact Report';
      var style = doc.createElement('style');
      style.textContent = '@page { size: A4; margin: 18mm; } body { margin: 24px; color: #18231c; font: 11pt/1.55 Arial,sans-serif; } pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }';
      doc.head.appendChild(style);
      var pre = doc.createElement('pre'); pre.textContent = $('impactReportText').value; doc.body.appendChild(pre);
      var p = doc.createElement('p'); p.textContent = 'Grassland Forest · LitVM · ' + timestamp(reportSummary && reportSummary.generatedAt); p.style.fontSize = '9pt'; doc.body.appendChild(p);
      popup.focus(); popup.print();
    }
    function search() { clearTimeout(searchTimer); page = 1; loadUsers(); }
    function refresh() {
      if (!active) return Promise.resolve();
      if (refreshWork) return refreshWork;
      var expectedEpoch = epoch;
      clearTimeout(summaryTimer);
      refreshWork = Promise.all([loadSummary(), loadUsers()]).finally(function () {
        if (epoch !== expectedEpoch) return;
        refreshWork = null;
        clearTimeout(summaryTimer);
        if (active) summaryTimer = setTimeout(refresh, SUMMARY_INTERVAL);
      });
      return refreshWork;
    }
    function stop() {
      active = false; epoch++; clearTimeout(summaryTimer); clearTimeout(scanTimer); clearTimeout(searchTimer);
      controllers.forEach(function (c) { c.abort(); }); controllers.clear();
      summaryWork = scanWork = userWork = refreshWork = null; userController = null; summary = reportSummary = lastUsers = null; generatingReport = false;
      scanStartDiagnostic = null;
      $('impactKpis').innerHTML = '<div class="kpi"><span class="label">Métricas verificables</span><div class="value">—</div></div>';
      ['impactContract', 'impactRelayer', 'impactGas', 'impactNonce', 'impactSigned', 'impactSponsored', 'impactRelayerStatus', 'impactUpdated', 'impactUserInfo', 'impactPage', 'impactScanStatus', 'impactScanDetail'].forEach(function (id) { setText(id, '—'); });
      $('impactUserRows').innerHTML = '<tr><td colspan="7" class="empty">Esperando autenticación…</td></tr>';
      $('impactQuality').textContent = 'Esperando datos del backend.'; $('impactReportText').value = ''; $('impactReportPanel').classList.add('hidden');
      $('impactScanProgress').hidden = true;
      ['impactExportCsv', 'impactExportJson', 'impactGenerate', 'analizarCC', 'impactPrev', 'impactNext'].forEach(function (id) { $(id).disabled = true; });
    }
    function start() {
      if (active) return refresh();
      active = true; epoch++; page = 1; $('analizarCC').disabled = false;
      loadScan(); return refresh();
    }
    $('impactRefresh').addEventListener('click', refresh);
    $('analizarCC').addEventListener('click', startScan);
    $('impactSearch').addEventListener('click', search);
    $('impactClear').addEventListener('click', function () { $('impactQ').value = ''; search(); });
    $('impactQ').addEventListener('input', function () { clearTimeout(searchTimer); searchTimer = setTimeout(search, 300); });
    $('impactQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') search(); });
    $('impactSort').addEventListener('change', search);
    $('impactPrev').addEventListener('click', function () { if (page > 1) { page--; loadUsers(); } });
    $('impactNext').addEventListener('click', function () { if (page * limit < total) { page++; loadUsers(); } });
    function exportDay() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' }); }
    $('impactExportCsv').addEventListener('click', function () { download('/export/users.csv', 'impactExportCsv', 'grassland-user-audit-' + exportDay() + '.csv', 'text/csv'); });
    $('impactExportJson').addEventListener('click', function () { download('/export/onchain.json', 'impactExportJson', 'grassland-onchain-evidence-' + exportDay() + '.json', 'application/json'); });
    $('impactGenerate').addEventListener('click', generateReport);
    $('impactRegenerate').addEventListener('click', generateReport);
    $('impactReportLanguage').addEventListener('change', renderReport);
    ['impactDiscord', 'impactTwitter', 'impactCommunity'].forEach(function (id) { $(id).addEventListener('input', renderReport); });
    $('impactCopy').addEventListener('click', copyReport); $('impactPrint').addEventListener('click', printReport);
    window.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', function () { if (active && !document.hidden) { refresh(); loadScan(); } });
    stop();
    return { start: start, stop: stop, refresh: refresh };
  }
  global.AdminImpactPanel = { create: create, buildReport: buildReport };
})(window);
