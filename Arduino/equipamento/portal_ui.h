#ifndef PORTAL_UI_H
#define PORTAL_UI_H

// Interface customizada 100% offline para o portal cativo SmartFarm (192.168.4.1)
static const char SMARTFARM_PORTAL_HEAD[] = R"rawliteral(
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#eef5ef!important;color:#1f2937!important;margin:0;padding:16px}
  body>div{display:block!important;max-width:420px;min-width:0!important;width:100%;margin:12px auto!important;background:#fff;border-radius:16px;padding:22px 20px!important;box-shadow:0 8px 24px rgba(27,94,32,.10);border:1px solid #dcedc8;text-align:left!important}
  .sf-brand{text-align:center;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid #e5e7eb}
  .sf-badge{display:inline-flex;align-items:center;gap:8px;background:#e8f5e9;color:#1b5e20;padding:6px 14px;border-radius:999px;font-weight:700;font-size:14px}
  .sf-sub{margin:8px 0 0;font-size:13px;color:#4b5563}
  .sf-sec{margin:16px 0 6px;padding-top:12px;border-top:1px dashed #cbd5e1;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#2e7d32}
  h1{font-size:20px!important;color:#1b5e20!important;margin:4px 0 2px!important;text-align:center}
  h3{font-size:13px!important;color:#6b7280!important;font-weight:500!important;margin:0 0 14px!important;text-align:center}
  label{display:block;text-align:left;font-size:13px;font-weight:600;color:#374151;margin:10px 0 4px}
  input:not([type=checkbox]){width:100%!important;padding:10px 12px!important;border:1px solid #cbd5e1!important;border-radius:8px!important;font-size:15px!important;background:#f9fafb;outline:none;color:#111827}
  input:not([type=checkbox]):focus{border-color:#2e7d32!important;background:#fff;box-shadow:0 0 0 3px rgba(46,125,50,.15)}
  input[type=checkbox]{width:auto!important;margin-right:6px;vertical-align:middle}
  input[type=checkbox]+label{display:inline-block;font-weight:500;margin:6px 0;vertical-align:middle}
  button{width:100%!important;background:#2e7d32!important;color:#fff!important;border:0!important;border-radius:10px!important;padding:11px 16px!important;font-size:15px!important;font-weight:600!important;line-height:1.4!important;cursor:pointer;margin-top:10px}
  button:hover{background:#1b5e20!important}
  button.sf-btn-sec{background:#f1f5f9!important;color:#1f2937!important;border:1px solid #cbd5e1!important}
  button.sf-btn-sec:hover{background:#e2e8f0!important}
  .msg{margin-top:14px!important;padding:10px 12px!important;border-radius:8px!important;background:#f8fafc!important;border-left:4px solid #2e7d32!important;font-size:13px!important;color:#334155!important}
  a{color:#1b5e20;text-decoration:none;font-weight:600}
  hr{border:0;border-top:1px solid #e5e7eb;margin:12px 0}
</style>
<script>
document.addEventListener('DOMContentLoaded', function(){
  var wrap = document.querySelector('body > div');
  if (wrap && !document.querySelector('.sf-brand')) {
    var b = document.createElement('div');
    b.className = 'sf-brand';
    b.innerHTML = "<div class='sf-badge'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='#1b5e20' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z'/><path d='M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12'/></svg><span>SmartFarm IoT</span></div><p class='sf-sub'>Configura\u00e7\u00e3o do M\u00f3dulo Equipamento</p>";
    wrap.insertBefore(b, wrap.firstChild);
  }
  var h1 = document.querySelector('h1');
  if (h1 && h1.textContent.indexOf('WiFiManager') !== -1) h1.textContent = 'Portal de Configura\u00e7\u00e3o';
  var btns = document.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    var t = btns[i].textContent.trim();
    if (t === 'Configure WiFi') btns[i].textContent = 'Configurar Wi-Fi e Dispositivo';
    else if (t === 'Save') btns[i].textContent = 'Salvar e Conectar';
    else if (t === 'Refresh') { btns[i].textContent = 'Atualizar Redes Wi-Fi'; btns[i].className += ' sf-btn-sec'; }
    else if (t === 'Restart') { btns[i].textContent = 'Reiniciar Dispositivo'; btns[i].className += ' sf-btn-sec'; }
  }
  var lbls = document.querySelectorAll('label');
  for (var j = 0; j < lbls.length; j++) {
    var lt = lbls[j].textContent.trim();
    if (lt === 'Password') lbls[j].textContent = 'Senha do Wi-Fi';
    else if (lt === 'Show Password') lbls[j].textContent = 'Mostrar senha';
    else if (lt.indexOf('E-mail da Conta SmartFarm') !== -1) {
      var sec = document.createElement('div');
      sec.className = 'sf-sec';
      sec.textContent = 'Vincula\u00e7\u00e3o SmartFarm';
      lbls[j].parentNode.insertBefore(sec, lbls[j]);
    }
  }
  var sp = document.getElementById('showpass');
  if (sp && sp.nextSibling && sp.nextSibling.nodeType === 3) {
    sp.nextSibling.nodeValue = ' Mostrar senha';
  }
  var sIn = document.getElementById('s');
  if (sIn) sIn.placeholder = 'Selecione acima ou digite o nome do Wi-Fi';
  var pIn = document.getElementById('p');
  if (pIn) pIn.placeholder = 'Digite a senha da rede Wi-Fi';
  var emIn = document.querySelector("input[name='usuario_email']");
  if (emIn) emIn.placeholder = 'ex: produtor@fazenda.com';
  var devIn = document.querySelector("input[name='device_id']");
  if (devIn) devIn.placeholder = 'ex: Equipto_01';
  var msgs = document.querySelectorAll('.msg, div.msg');
  for (var k = 0; k < msgs.length; k++) {
    var h = msgs[k].innerHTML;
    h = h.replace('Not connected', 'Aguardando configura\u00e7\u00e3o').replace('to ESP32', 'no m\u00f3dulo')
         .replace('Credentials Saved', 'Credenciais salvas! Conectando...');
    msgs[k].innerHTML = h;
  }
});
</script>
)rawliteral";

#endif
