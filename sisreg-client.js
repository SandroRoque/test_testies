/* eslint-disable no-console */
/**
 * SISREG AIH Client - Browser Extension Version
 * Provides comprehensive AIH data extraction and management for sisregiii.saude.gov.br
 */

(function() {
  'use strict';

  /////////////////////////////
  // Config
  /////////////////////////////

  /** @typedef {{
   *  codSol: string, cns: string, nome: string, codProced: string, procedimento: string,
   *  numeroAih: string,
   *  dataSolicitacao: Date|null,
   *  dataAutorizacao: Date|null,
   *  dataReserva: Date|null,
   *  dataInternacao: Date|null,
   *  dataPrevistaAlta: Date|null,
   *  dataAlta: Date|null,
   *  statusAih: string
   * }} AihDetalhe */

  /** @typedef {{ id: string, dtInternacaoLista?: string, usuario?: string,
   * procedimento?: string, clinica?: string, risco?: string }} ListRow */

  var DEFAULTS = {
    baseUrl: 'https://sisregiii.saude.gov.br',
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    timeoutMs: 30000,
    retry: { retries: 3, minDelayMs: 500, factor: 2 },
    csvDelimiter: ';',
    log: true
  };

  /////////////////////////////
  // Utils
  /////////////////////////////

  var Log = {
    info: function() { if (DEFAULTS.log) console.log.apply(console, arguments); },
    warn: function() { if (DEFAULTS.log) console.warn.apply(console, arguments); },
    error: function() { if (DEFAULTS.log) console.error.apply(console, arguments); }
  };

  function sleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

  function withTimeout(promise, ms, signal) {
    if (signal && signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    return new Promise(function(resolve, reject) {
      var t = setTimeout(function(){ reject(new Error('Timeout after ' + ms + 'ms')); }, ms);
      promise.then(function(v){ clearTimeout(t); resolve(v); }, function(e){ clearTimeout(t); reject(e); });
      if (signal) {
        signal.addEventListener('abort', function(){ clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
      }
    });
  }

  function buildUrl(pathOrAbsolute, params) {
    var u = pathOrAbsolute.indexOf('http') === 0
      ? new URL(pathOrAbsolute)
      : new URL(pathOrAbsolute, DEFAULTS.baseUrl);
    if (params) {
      Object.keys(params).forEach(function(k){
        var v = params[k];
        if (v != null) u.searchParams.set(k, String(v));
      });
    }
    return u.toString();
  }

  function parseHTML(html) {
    return new DOMParser().parseFromString(html, 'text/html');
  }

  /** Normaliza rótulos: remove acentos (combining marks), trim, colapsa espaços e remove pontuação final. */
  function normalizeLabel(s) {
    return (s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[;:]+$/, '')
      .trim()
      .toLowerCase();
  }

  /** Busca <td> cujo texto COMEÇA com label (tolerante) */
  function findLabeledCell(cells, label) {
    var target = normalizeLabel(label);
    for (var i=0;i<cells.length;i++) {
      var td = cells[i];
      if (normalizeLabel(td && td.textContent).indexOf(target) === 0) return td;
    }
    return null;
  }

  function text(el) { return ((el && el.textContent) || '').trim(); }

  /** Converte datas do SISREG (dd.mm.yyyy|dd/mm/yyyy [ - HH:MM[:SS]]) em Date local. */
  function parseSisregDate(raw) {
    var s = (raw || '').replace(/\u00A0/g, ' ').trim();
    if (!s) return null;

    var datePart = s, timePart = '';
    var dashIdx = s.indexOf(' - ');
    if (dashIdx >= 0) {
      datePart = s.slice(0, dashIdx).trim();
      timePart = s.slice(dashIdx + 3).trim();
    }

    datePart = datePart.replace(/\./g, '/');
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(datePart);
    if (!m) return null;

    var dd = Number(m[1]), mm = Number(m[2]), yyyy = Number(m[3]);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

    var hh = 0, mi = 0, ss = 0;
    if (timePart) {
      var t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(timePart);
      if (t) {
        hh = Number(t[1]); mi = Number(t[2]); ss = Number(t[3] || 0);
      }
    }
    return new Date(yyyy, mm - 1, dd, hh, mi, ss);
  }

  /** Formata Date -> "YYYY-MM-DD HH:mm:ss" (local) para CSV. */
  function formatDateLocal(dt) {
    if (!(dt instanceof Date) || isNaN(+dt)) return '';
    var pad = function(n){ return String(n).padStart(2, '0'); };
    return dt.getFullYear() + '-' + pad(dt.getMonth()+1) + '-' + pad(dt.getDate())
         + ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes()) + ':' + pad(dt.getSeconds());
  }

  /////////////////////////////
  // HTTP client
  /////////////////////////////

  function httpFetch(url, init) {
    init = init || {};
    var retries = DEFAULTS.retry.retries;
    var minDelayMs = DEFAULTS.retry.minDelayMs;
    var factor = DEFAULTS.retry.factor;

    var attempt = 0;
    var lastErr;

    function attemptOnce() {
      var ctrl = new AbortController();
      var signal = (init && 'signal' in init && init.signal) ? init.signal : ctrl.signal;

      return withTimeout(fetch(url, Object.assign({
        credentials: 'include'
      }, init, {
        headers: Object.assign({}, DEFAULTS.headers, (init && init.headers) || {}),
        signal: signal
      })), DEFAULTS.timeoutMs, signal).then(function(res){
        if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
        return res;
      });
    }

    return new Promise(function(resolve, reject){
      (function loop(){
        attemptOnce().then(resolve).catch(function(err){
          lastErr = err;
          attempt++;
          if (attempt > retries) return reject(lastErr);
          var delay = minDelayMs * Math.pow(factor, attempt - 1);
          Log.warn('Fetch falhou (tentativa ' + attempt + '/' + retries + ') -> ' + err + '. Aguardando ' + delay + 'ms…');
          sleep(delay).then(loop);
        });
      })();
    });
  }

  function httpGetText(url, init) {
    init = init || {};
    return httpFetch(url, Object.assign({ method: 'GET' }, init)).then(function(res){ return res.text(); });
  }

  function httpFormPostText(url, formObj) {
    var body = new URLSearchParams(formObj).toString();
    return httpFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    }).then(function(res){ return res.text(); });
  }

  /////////////////////////////
  // Concurrency pool
  /////////////////////////////

  function mapPool(items, limit, worker) {
    var out = new Array(items.length);
    var next = 0;
    var workers = [];
    var w = Math.min(limit, items.length);
    for (var k=0;k<w;k++) {
      workers.push((function(){
        return (function run(){
          var i = next++;
          if (i >= items.length) return Promise.resolve();
          return Promise.resolve(worker(items[i], i)).then(function(v){
            out[i] = v;
            return run();
          });
        })();
      })());
    }
    return Promise.all(workers).then(function(){ return out; });
  }

  /////////////////////////////
  // CSV handling
  /////////////////////////////

  function toCsv(rows, delimiter) {
    delimiter = delimiter || DEFAULTS.csvDelimiter;
    if (!rows || !rows.length) return '\uFEFF';
    var headers = Object.keys(rows[0]);
    function esc(val) {
      var s = val;
      if (val instanceof Date) s = formatDateLocal(val);
      else if (val == null) s = '';
      else s = String(val);
      return /[;\n\r"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    var lines = [ headers.join(delimiter) ];
    for (var i=0;i<rows.length;i++) {
      var r = rows[i];
      lines.push(headers.map(function(h){ return esc(r[h]); }).join(delimiter));
    }
    return '\uFEFF' + lines.join('\r\n');
  }

  function downloadCsv(content, filename) {
    // Use chrome.downloads API for browser extension
    if (typeof chrome !== 'undefined' && chrome.downloads) {
      var blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
      }, function() {
        URL.revokeObjectURL(url);
      });
    } else {
      // Fallback to traditional download method
      var blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    }
  }

  /////////////////////////////
  // AIH Parsing
  /////////////////////////////

  function parseAihTable(table) {
    /** @type {AihDetalhe} */
    var out = {
      codSol: '', cns: '', nome: '', codProced: '', procedimento: '',
      numeroAih: '',
      dataSolicitacao: null,
      dataAutorizacao: null,
      dataReserva: null,
      dataInternacao: null,
      dataPrevistaAlta: null,
      dataAlta: null,
      statusAih: ''
    };
    if (!table) return out;

    var cells = Array.prototype.slice.call(table.querySelectorAll('td'));

    function label(name) { return findLabeledCell(cells, name); }

    function readNextRowSameCol(cell) {
      if (!cell) return '';
      var row = cell.parentElement;
      var nextRow = row ? row.nextElementSibling : null;
      var tgt = nextRow && nextRow.cells ? nextRow.cells[cell.cellIndex] : null;
      return text(tgt);
    }

    function getAfterColon(cell) {
      if (!cell) return '';
      var raw = text(cell);
      if (raw.indexOf(':') >= 0) {
        var parts = raw.split(':');
        return (parts[1] || '').trim();
      }
      var sib = cell.nextElementSibling;
      return (sib && text(sib)) || readNextRowSameCol(cell) || '';
    }

    // Extract basic info
    out.codSol    = getAfterColon(label('Código Solicitação'));
    out.numeroAih = getAfterColon(label('Número AIH'));
    out.nome      = readNextRowSameCol(label('Nome do Paciente'));

    // Status handling
    var trocaCell = null;
    for (var i=0;i<cells.length;i++) {
      if (/troca de procedimentos/i.test(text(cells[i]))) { trocaCell = cells[i]; break; }
    }
    if (trocaCell) {
      var aprovRow = trocaCell.parentElement && trocaCell.parentElement.nextElementSibling
        ? trocaCell.parentElement.nextElementSibling.nextElementSibling
        : null;
      var aprovCell = aprovRow && aprovRow.cells ? aprovRow.cells[3] : null;
      var aprov = text(aprovCell);
      out.statusAih = aprov === 'Aprovada' ? 'TROCA_APROVADA' : 'TROCA_PENDENTE';
    }
    if (!out.statusAih) {
      out.statusAih = readNextRowSameCol(label('Status da Solicitação'));
    }

    // Extract dates
    var rawSolic   = getAfterColon(label('Data de Solicitação'));
    var rawAut     = getAfterColon(label('Data de Autorização')) || getAfterColon(label('Data de Autorizacao'));
    var rawReserva = getAfterColon(label('Data de Reserva'));
    var rawInter   = getAfterColon(label('Data de Internação')) || getAfterColon(label('Data de Internacao'));
    var rawPrev    = getAfterColon(label('Data Prevista de Alta'));
    var rawAlta    = getAfterColon(label('Data de Alta'));

    out.dataSolicitacao = parseSisregDate(rawSolic);
    out.dataAutorizacao = parseSisregDate(rawAut);
    out.dataReserva     = parseSisregDate(rawReserva);
    out.dataInternacao  = parseSisregDate(rawInter);
    out.dataPrevistaAlta= parseSisregDate(rawPrev);
    out.dataAlta        = parseSisregDate(rawAlta);

    // Extract procedure info
    var procLabel = label('Procedimento Solicitado');
    if (procLabel) {
      var row = procLabel.parentElement ? procLabel.parentElement.nextElementSibling : null;
      var c0 = row && row.cells ? row.cells[procLabel.cellIndex] : null;
      var c1 = row && row.cells ? row.cells[procLabel.cellIndex + 1] : null;
      out.procedimento = text(c0);
      out.codProced    = text(c1);
    }

    // Handle procedure changes for approved exchanges
    if (out.statusAih === 'TROCA_APROVADA' && trocaCell) {
      var hdrRow = trocaCell.parentElement ? trocaCell.parentElement.nextElementSibling : null;
      var hdrC1  = hdrRow && hdrRow.cells ? hdrRow.cells[1] : null;
      if (hdrC1 && /procedimento/i.test(text(hdrC1))) {
        var valRow = hdrRow.nextElementSibling;
        if (valRow && valRow.cells && valRow.cells.length) {
          var cellTxt = text(valRow.cells[1]);
          if (cellTxt) {
            var parts = cellTxt.split(' - ', 2);
            if (parts.length === 2) {
              out.codProced    = parts[0].trim();
              out.procedimento = parts[1].trim();
            }
          }
        }
      }
    }

    // Extract CNS
    out.cns = readNextRowSameCol(label('CNS'));

    return out;
  }

  /////////////////////////////
  // API Endpoints
  /////////////////////////////

  var endpoints = {
    consAih: function(params) { return buildUrl('/cgi-bin/cons_aih', params); },
    listaInternacoes: '/cgi-bin/config_saida_permanencia',
    listaAutorizacoes: '/cgi-bin/config_internar',
    internar: '/cgi-bin/config_internar',
    salvarAlta: function(co_motivo, cod_solicitacao_ficha) {
      return buildUrl('/cgi-bin/config_saida_permanencia', {
        etapa: 'SALVAR_ALTA',
        co_motivo: co_motivo,
        justificativa_perm: '',
        co_clinica: '',
        cod_solicitacao_ficha: cod_solicitacao_ficha
      });
    }
  };

  function getAihTable(codSolicitacao) {
    var params = {
      etapa: 'VISUALIZAR_FICHA',
      co_solicitacao: '',
      cns: '',
      no_usuario: '',
      dt_inicial_sol: '',
      dt_final_sol: '',
      dt_inicial_res: '',
      dt_final_res: '',
      co_procedimento: '',
      co_ups_sol: '',
      co_clinica: '',
      co_prioridade: '',
      cod_solicitacao_ficha: codSolicitacao,
      ordenacao: '',
      pagina: '0'
    };
    var url = endpoints.consAih(params);
    return httpGetText(url).then(function(html){
      var doc = parseHTML(html);
      return doc.querySelector('table.table_listagem');
    });
  }

  /** @returns {Promise<AihDetalhe>} */
  function getAihDetalhe(codSolicitacao) {
    return getAihTable(codSolicitacao).then(function(table){
      return parseAihTable(table);
    });
  }

  function enviarAlta(co_motivo, cod_solicitacao_ficha) {
    if (typeof co_motivo === 'undefined') co_motivo = 38;
    var url = endpoints.salvarAlta(co_motivo, cod_solicitacao_ficha);
    return httpGetText(url);
  }

  function enviarInternacao(codSol, dtInternacao, medico) {
    var form = {
      etapa: 'SALVAR_INTERNACAO',
      medico: String(medico || ''),
      dt_internacao: dtInternacao,
      cod_solicitacao_ficha: String(codSol)
    };
    return httpFormPostText(endpoints.internar, form);
  }

  function pegaNumeroAih(codSolicitacao) {
    return getAihDetalhe(codSolicitacao).then(function(d){
      if (!d.numeroAih) {
        Log.warn('Nenhum número de AIH disponível para essa solicitação.');
        return null;
      }
      Log.info('AIH da internação do dia ' + d.dataInternacao + ' de ' + d.nome + ': ' + d.numeroAih);
      return d.numeroAih;
    }).catch(function(e){
      Log.error('Erro ao obter número da AIH:', e);
      return null;
    });
  }

  function pegaNumeroAihAltaCondicional(codSol, codAlta) {
    if (typeof codAlta === 'undefined') codAlta = 38;
    return getAihDetalhe(codSol).then(function(d){
      if (!d.numeroAih) {
        if (d.statusAih === 'TROCA_PENDENTE') {
          Log.info('Status TROCA_PENDENTE. Não enviar alta.');
          return d;
        }
        Log.info('Número AIH vazio, enviando alta…');
        return enviarAlta(codAlta, codSol).then(function(){ return getAihDetalhe(codSol); });
      }
      return d;
    }).then(function(d){
      Log.info('AIH da internação do dia ' + d.dataInternacao + ' de ' + d.nome + ': ' + d.numeroAih);
      return d.numeroAih || null;
    }).catch(function(e){
      Log.error('Erro ao obter número AIH condicionalmente:', e);
      return null;
    });
  }

  function internarAltaExtrairAIH(codSol, dtInternacao, medico, motivoAlta, opts) {
    if (typeof motivoAlta === 'undefined') motivoAlta = 38;
    opts = opts || {};
    var maxTentativas = opts.maxTentativas != null ? opts.maxTentativas : 8;
    var esperaMs = opts.esperaMs != null ? opts.esperaMs : 1500;

    function temDataValida(d) {
      return d && d.dataInternacao instanceof Date && !isNaN(+d.dataInternacao);
    }

    function pollAteInternacao() {
      var tent = 0;
      function loop() {
        return getAihDetalhe(codSol).then(function(d){
          if (temDataValida(d)) return pegaNumeroAihAltaCondicional(String(codSol), motivoAlta);
          tent++;
          if (tent >= maxTentativas) {
            Log.warn('Internação não confirmada após ' + maxTentativas + ' tentativas');
            return null;
          }
          return sleep(esperaMs).then(loop);
        }).catch(function(e){
          Log.warn('Erro ao validar internação (tentativa ' + (tent+1) + '):', e);
          tent++;
          if (tent >= maxTentativas) return null;
          return sleep(esperaMs).then(loop);
        });
      }
      return loop();
    }

    return getAihDetalhe(codSol).then(function(d){
      if (temDataValida(d)) {
        Log.info('Já possui Data de Internação. Buscando AIH…');
        return pegaNumeroAihAltaCondicional(String(codSol), motivoAlta);
      }
      Log.info('Sem Data de Internação. Enviando internação…');
      return enviarInternacao(codSol, dtInternacao, medico).then(pollAteInternacao);
    }).catch(function(e){
      Log.error('Falha em internarAltaExtrairAIH:', e);
      return null;
    });
  }

  /////////////////////////////
  // List Management
  /////////////////////////////

  function listarInternacoes(opts) {
    opts = opts || {};
    var form = {
      etapa: 'PESQUISAR',
      cns_paciente: '', no_usuario: '', co_procedimento: '', cmb_clinica: '',
      dt_inicial: '', dt_final: '', ordenacao: 2,
      pagina: opts.pagina
    };
    if (opts.txtPagina != null) form.txtPagina = opts.txtPagina;
    return httpFormPostText(endpoints.listaInternacoes, form);
  }

  function rowsInternacoesFrom(html) {
    var doc = parseHTML(html);
    var rows = [];
    var trs = doc.querySelectorAll('tr.linha_selecionavel');
    for (var i=0;i<trs.length;i++) {
      var tr = trs[i];
      var m = (tr.getAttribute('onclick') || '').match(/'(\d+)'/);
      var id = (m && m[1]) || '';
      var tds = tr.querySelectorAll('td');
      var risco = '';
      if (tds && tds[4]) {
        var img = tds[4].querySelector('img');
        if (img && img.src) {
          var parts = img.src.split('/');
          var last = parts[parts.length-1] || '';
          risco = (last.split('.')[0]) || '';
        }
      }
      rows.push({
        id: id,
        dtInternacaoLista: tds && tds[0] ? text(tds[0]) : '',
        usuario:           tds && tds[1] ? text(tds[1]) : '',
        procedimento:      tds && tds[2] ? text(tds[2]) : '',
        clinica:           tds && tds[3] ? text(tds[3]) : '',
        risco: risco
      });
    }
    return rows;
  }

  function getHospitalizationTables(opts) {
    opts = opts || {};
    var onProgress = opts.onProgress || function(){};
    return listarInternacoes({ pagina: 0 }).then(function(firstHtml){
      var firstDoc = parseHTML(firstHtml);
      var pageInput = firstDoc.querySelector("input[name='txtPagina']");
      var pageTd = pageInput ? pageInput.closest('td') : null;
      var totalPages = 1;
      if (pageTd) {
        var m = text(pageTd).match(/de\s*(\d+)/i);
        if (m) totalPages = Number(m[1]);
      }
      Log.info('📄 Total de páginas detectadas: ' + totalPages);

      var allRows = [];
      var p = 0;

      function loop() {
        if (p >= totalPages) {
          Log.info('📥 Total de registros listados: ' + allRows.length);
          return allRows;
        }
        var isFirst = (p === 0);
        var promise = isFirst
          ? Promise.resolve(firstHtml)
          : listarInternacoes({ pagina: p, txtPagina: p });
        return promise.then(function(html){
          var rows = rowsInternacoesFrom(html);
          Log.info('📄 Página ' + (p+1) + ': ' + rows.length + ' registros');
          onProgress({ pagina: p+1, totalPages: totalPages, rows: rows.length });
          Array.prototype.push.apply(allRows, rows);
          p++;
          return loop();
        });
      }

      return loop();
    });
  }

  function listarAutorizacoes(opts) {
    opts = opts || {};
    var form = {
      etapa: 'PESQUISAR',
      pagina: opts.pageIdx,
      txtPagina: opts.txtPage,
      cns_paciente: '', no_usuario: '', co_procedimento: '', cmb_clinica: '',
      dt_inicial: '', dt_final: '', ordenacao: 5, cod_solicitacao_ficha: ''
    };
    return httpFormPostText(endpoints.listaAutorizacoes, form);
  }

  function rowsAutorizacoesFrom(html) {
    var doc = parseHTML(html);
    var out = [];
    var trs = doc.querySelectorAll('tr.linha_selecionavel');
    for (var i=0;i<trs.length;i++) {
      var tr = trs[i];
      var m = (tr.getAttribute('onclick') || '').match(/'(\d+)'/);
      out.push({ id: (m && m[1]) || '' });
    }
    return out;
  }

  function getAuthorizationList(opts) {
    opts = opts || {};
    var onProgress = opts.onProgress || function(){};
    return listarAutorizacoes({ pageIdx: 0, txtPage: 1 }).then(function(firstHtml){
      var firstDoc = parseHTML(firstHtml);
      var totalPages = 1;
      var pageInput = firstDoc.querySelector("input[name='txtPagina']");
      if (pageInput) {
        var td = pageInput.closest('td');
        if (td) {
          var m = text(td).match(/de\s*(\d+)/i);
          if (m) totalPages = Number(m[1]);
        }
      }
      var allRows = [];
      var p = 0;

      function loop() {
        if (p >= totalPages) return allRows;
        var promise = (p === 0) ? Promise.resolve(firstHtml) : listarAutorizacoes({ pageIdx: p, txtPage: p+1 });
        return promise.then(function(html){
          var rows = rowsAutorizacoesFrom(html);
          Log.info('📄 Página ' + (p+1) + ': ' + rows.length + ' registros');
          onProgress({ pagina: p+1, totalPages: totalPages, rows: rows.length });
          Array.prototype.push.apply(allRows, rows);
          p++;
          return loop();
        });
      }

      return loop();
    });
  }

  /////////////////////////////
  // Bulk Operations
  /////////////////////////////

  function crawlHospitalizations(opts) {
    opts = opts || {};
    var csvName = opts.csvName || 'aih_detalhes.csv';
    var concurrency = opts.concurrency || 6;
    var onProgress = opts.onProgress || function(){};

    return getHospitalizationTables().then(function(list){
      Log.info('🔍 Total de IDs encontrados: ' + list.length);
      var done = 0, fail = 0;
      return mapPool(list, concurrency, function(row){
        var id = row.id;
        return getAihDetalhe(id).then(function(d){
          done++; onProgress({ done: done, total: list.length });
          return d;
        }).catch(function(e){
          Log.warn('❌ Falha ao processar ID ' + id + ':', e);
          fail++; done++; onProgress({ done: done, total: list.length });
          return null;
        });
      }).then(function(parsed){
        Log.info('✅ Sucesso: ' + done + ', ❌ Falhas: ' + fail);
        var rows = parsed.filter(function(x){ return !!x; });
        if (!rows.length) {
          Log.warn('Nenhum dado extraído com sucesso.');
          return [];
        }
        var csv = toCsv(rows);
        downloadCsv(csv, csvName);
        return rows;
      });
    });
  }

  function crawlAuthorizations(opts) {
    opts = opts || {};
    var csvName = opts.csvName || 'aih_autorizacoes.csv';
    var concurrency = opts.concurrency || 6;
    var onProgress = opts.onProgress || function(){};

    return getAuthorizationList().then(function(list){
      Log.info('🔍 Total de autorizações encontradas: ' + list.length);
      var done = 0, fail = 0;
      return mapPool(list, concurrency, function(row){
        var id = row.id;
        return getAihDetalhe(id).then(function(d){
          done++; onProgress({ done: done, total: list.length });
          return d;
        }).catch(function(e){
          Log.warn('❌ Erro ao processar ficha ' + id + ':', e);
          fail++; done++; onProgress({ done: done, total: list.length });
          return null;
        });
      }).then(function(parsed){
        var rows = parsed.filter(function(x){ return !!x; });
        if (!rows.length) {
          Log.warn('Nenhum dado extraído com sucesso.');
          return [];
        }
        var csv = toCsv(rows);
        downloadCsv(csv, csvName);
        Log.info('✅ CSV exportado com ' + rows.length + ' registros');
        return rows;
      });
    });
  }

  function crawlSisreg(opts) {
    opts = opts || {};
    var csvName = opts.csvName || 'aih_sisreg.csv';
    var concurrency = opts.concurrency || 6;
    var onProgress = opts.onProgress || function(){};

    return Promise.all([getHospitalizationTables(), getAuthorizationList()]).then(function(results){
      var hosp = results[0] || [];
      var auth = results[1] || [];
      Log.info('🔍 IDs hospitalizações: ' + hosp.length + ', autorizações: ' + auth.length);

      var idMap = {};
      hosp.forEach(function(r){ idMap[r.id] = idMap[r.id] || { id: r.id, sources: [] }; idMap[r.id].sources.push('hospitalizacao'); });
      auth.forEach(function(r){ idMap[r.id] = idMap[r.id] || { id: r.id, sources: [] }; idMap[r.id].sources.push('autorizacao'); });

      var items = Object.keys(idMap).map(function(k){ return idMap[k]; });
      Log.info('🔁 Total de IDs únicos a processar: ' + items.length);

      var done = 0, fail = 0;
      return mapPool(items, concurrency, function(item){
        return getAihDetalhe(item.id).then(function(d){
          if (d && typeof d === 'object') d.sisreg_sources = item.sources.join(';');
          done++; onProgress({ done: done, total: items.length });
          return d;
        }).catch(function(e){
          Log.warn('❌ Falha ao processar ID ' + item.id + ':', e);
          fail++; done++; onProgress({ done: done, total: items.length });
          return null;
        });
      }).then(function(parsed){
        Log.info('✅ Processados: ' + done + ', ❌ Falhas: ' + fail);
        var rows = parsed.filter(function(x){ return !!x; });
        if (!rows.length) {
          Log.warn('Nenhum dado extraído com sucesso.');
          return [];
        }
        var csv = toCsv(rows);
        downloadCsv(csv, csvName);
        Log.info('✅ CSV exportado com ' + rows.length + ' registros para ' + csvName);
        return rows;
      });
    });
  }

  /////////////////////////////
  // Public API
  /////////////////////////////

  window.SISREG = {
    config: DEFAULTS,
    http: { httpFetch: httpFetch, httpGetText: httpGetText, httpFormPostText: httpFormPostText },
    utils: {
      parseHTML: parseHTML,
      mapPool: mapPool,
      toCsv: toCsv,
      downloadCsv: downloadCsv,
      normalizeLabel: normalizeLabel,
      parseSisregDate: parseSisregDate,
      formatDateLocal: formatDateLocal
    },
    parsers: { parseAihTable: parseAihTable },
    endpoints: endpoints,
    api: {
      getAihTable: getAihTable,
      getAihDetalhe: getAihDetalhe,
      enviarAlta: enviarAlta,
      pegaNumeroAih: pegaNumeroAih,
      pegaNumeroAihAltaCondicional: pegaNumeroAihAltaCondicional,
      getHospitalizationTables: getHospitalizationTables,
      getAuthorizationList: getAuthorizationList,
      crawlHospitalizations: crawlHospitalizations,
      crawlAuthorizations: crawlAuthorizations,
      enviarInternacao: enviarInternacao,
      internarAltaExtrairAIH: internarAltaExtrairAIH,
      crawlSisreg: crawlSisreg
    }
  };

  // Notify extension that SISREG is loaded
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({
      type: 'SISREG_LOADED',
      url: window.location.href
    }).catch(function(e) {
      // Ignore errors if extension context is not available
    });
  }

  Log.info('🚀 SISREG AIH Client carregado com sucesso!');

})();