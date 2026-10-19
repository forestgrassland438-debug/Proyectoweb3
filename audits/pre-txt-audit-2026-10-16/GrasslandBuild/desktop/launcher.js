'use strict';
const select=document.getElementById('browser'),button=document.getElementById('play'),status=document.getElementById('status');
function render(state){
  status.textContent=state.message;status.dataset.error=String(state.kind==='error');
  const waiting=['opening','waiting','checking','signing-out'].includes(state.kind);
  button.disabled=waiting;select.disabled=waiting;
  for(const id of ["check","reconnect","switch","signout"])document.getElementById(id).disabled=waiting;
  document.getElementById('cancel').hidden=!['opening','waiting'].includes(state.kind);
  const code=document.getElementById('pair-code');code.hidden=!state.code;code.textContent=state.code?'Confirm this code in your browser: '+state.code:'';
  document.body.classList.toggle('playing',state.kind==='playing');
}
button.addEventListener('click',async()=>{button.disabled=true;try{const result=await window.grassland.open(select.value);if(result.message)render({kind:'error',message:result.message});}catch{render({kind:'error',message:'Could not start sign-in. Please retry.'});}});
for(const id of ['check','reconnect'])document.getElementById(id).addEventListener('click',()=>window.grassland.resume(select.value).catch(()=>render({kind:'error',message:'Could not verify the session. Retry.'})));
document.getElementById('signout').addEventListener('click',()=>window.grassland.signOut());
document.getElementById('switch').addEventListener('click',()=>window.grassland.switchAccount(select.value));
document.getElementById('cancel').addEventListener('click',()=>window.grassland.cancel());
const unsubscribe=window.grassland.onState(render);window.addEventListener('unload',unsubscribe,{once:true});
window.grassland.config().then(config=>{for(const browser of config.browsers){const option=document.createElement('option');option.value=browser.id;option.textContent=browser.name;select.appendChild(option);}select.value=config.selected;document.getElementById('version').textContent=config.version;render(config.state);}).catch(()=>render({kind:'error',message:'Could not load settings. Restart the app.'}));
