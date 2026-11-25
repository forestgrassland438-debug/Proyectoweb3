from pathlib import Path
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('cutils',str(Path('tools/continuation-utils.py').resolve())).load_module();p='tienda_sistema.js';s=u.read(p);start=s.index('    initMobileTouchEvents() {');end=s.index('    // Manejar doble click',start);old=s[start:end]
new='''    initMobileTouchEvents() {
        const items=document.getElementById('tienda-items');if(!items)return;
        let down=null;
        items.addEventListener('pointerdown',e=>{if(!this.isMobile)return;const card=e.target.closest('.item-card');down=card?{id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now(),card}:null;});
        items.addEventListener('pointercancel',()=>{down=null;});
        items.addEventListener('pointerup',e=>{
            const tap=down;down=null;
            if(!this.isMobile||!tap||tap.id!==e.pointerId||!tap.card.isConnected||tap.card!==e.target.closest('.item-card')||Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>12||performance.now()-tap.time>800)return;
            if(tap.card.classList.contains('sold-out'))return;
            const id=tap.card.dataset.itemId;this.selectItem(id);
            if(this.selectedItem?.id===id&&!this._isLockedByLevel(this.selectedItem))this.openMobileModal();
        });
    }

    // Delegated pointer handling survives filtering without per-card touch timers.
    setupItemTouchEvents() {}

'''
u.change(p,old,new)
print('Mobile shop opens item actions with one completed tap and ignores scrolling gestures')
