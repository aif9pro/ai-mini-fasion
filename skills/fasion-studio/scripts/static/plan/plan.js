// ==================== Plan Module ====================
var Plan = (function(){
    var moods = [];
    var selectedMoodId = null;
    var selectedMoodEl = null;
    var scrollTimer = null;
    var currentMood = null;
    var currentLang = 'cn';
    var currentMoodPath = null;
    var pollTimer = null;
    var previewImages = [];
    var previewIndex = -1;

    function init(){
        autoLoadMood();
        initPlanDividers();
        document.addEventListener('keydown', function(e){
            var el = document.getElementById('planViewer');
            if(!el || !el.classList.contains('show')) return;
            if(e.key === 'Escape'){ closePreview(); }
            else if(e.key === 'ArrowLeft' || e.key === 'ArrowUp'){ prevPreview(); }
            else if(e.key === 'ArrowRight' || e.key === 'ArrowDown'){ nextPreview(); }
        });
    }

    function initPlanDividers(){
        // 左边界：调整左侧方案列表宽度（向右拖=变宽）
        _initDivider('planDividerLeft', 'planList', 'plan_list_w', 1);
        // 右边界：调整右侧素材列表宽度（向右拖=变窄）
        _initDivider('planDividerRight', 'planMaterials', 'plan_materials_w', -1);
    }

    function _initDivider(dividerId, targetId, storeKey, dir){
        var divider = document.getElementById(dividerId);
        var target = document.getElementById(targetId);
        if(!divider || !target) return;

        var MIN_W = 180, MAX_W = 700;
        var saved = parseInt(localStorage.getItem(storeKey));
        if(saved && saved >= MIN_W) target.style.width = saved + 'px';

        var dragging = false, startX = 0, startW = 0;

        divider.addEventListener('mousedown', function(e){
            e.preventDefault();
            dragging = true;
            startX = e.clientX;
            startW = target.getBoundingClientRect().width;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', function(e){
            if(!dragging) return;
            var newW = Math.max(MIN_W, Math.min(MAX_W, startW + (e.clientX - startX) * dir));
            target.style.width = newW + 'px';
        });

        document.addEventListener('mouseup', function(){
            if(!dragging) return;
            dragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            localStorage.setItem(storeKey, parseInt(target.style.width));
        });
    }

    function autoLoadMood(){
        fetch('/api/plan-mood').then(function(r){ return r.json(); }).then(function(data){
            var dirs = data.dirs || [];
            if(!dirs.length){
                document.getElementById('planList').innerHTML = '<div class="empty">未找到策划文件</div>';
                return;
            }
            loadMood(dirs[0].path);
        })['catch'](function(e){
            document.getElementById('planList').innerHTML = '<div class="empty">加载失败: '+e.message+'</div>';
        });
    }

    function loadMood(path){
        currentMoodPath = path;
        stopPolling();
        document.getElementById('planList').innerHTML = '<div class="empty"><div class="spinner"></div>加载中</div>';
        document.getElementById('planDetail').innerHTML = '<div class="detail-empty">← 选择左侧方案查看详情</div>';

        fetch('/api/plan-mood?path='+encodeURIComponent(path)).then(function(r){ return r.json(); }).then(function(data){
            if(data.error){ throw new Error(data.error); }
            moods = data.moods || [];
            selectedMoodId = null;
            selectedMoodEl = null;
            renderList();
        })['catch'](function(e){
            document.getElementById('planList').innerHTML = '<div class="empty">加载失败: '+e.message+'</div>';
        });
    }

    function renderList(){
        var container = document.getElementById('planList');
        if(!moods.length){
            container.innerHTML = '<div class="empty">无方案数据</div>';
            return;
        }
        container.innerHTML = moods.map(function(m){
            var act = selectedMoodId === m.mood_id ? ' active' : '';
            return '<div class="plan-item'+act+'" data-mood-id="'+m.mood_id+'" onclick="Plan.selectMood(\''+m.mood_id+'\', this);">'+
                '<div class="plan-item-img"><div class="plan-img-placeholder">&#9670;</div></div>'+
                '<div class="plan-item-info">'+
                '<div class="plan-item-id">'+m.mood_id+'</div>'+
                '<div class="plan-item-title">'+_escapeHtml(m.title)+'</div>'+
                '</div></div>';
        }).join('');
    }

    function selectMood(moodId, el){
        selectedMoodId = moodId;
        if(el) selectedMoodEl = el;
        document.querySelectorAll('.plan-item').forEach(function(item){
            item.classList.toggle('active', item.getAttribute('data-mood-id') === moodId);
        });
        if(selectedMoodEl){
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(function(){
                if(selectedMoodEl) selectedMoodEl.scrollIntoView({behavior:'smooth', block:'nearest'});
            }, 50);
        }
        var mood = moods.find(function(m){ return m.mood_id === moodId; });
        if(!mood) return;
        renderDetail(mood);
    }

    function renderDetail(mood){
        var container = document.getElementById('planDetail');

        var sections = [
            {key:'model_casting', name:'人物与模特'},
            {key:'beauty_pose', name:'妆发与姿态'},
            {key:'fashion_styling', name:'服装与造型'},
            {key:'accessory_details', name:'配饰与细节'},
            {key:'art_direction', name:'场景与美术'},
            {key:'lens_composition', name:'镜头与构图'},
            {key:'lighting_design', name:'光影设计'},
            {key:'color_texture', name:'色彩与质感'},
            {key:'motion_story', name:'动势与叙事'},
            {key:'technical_post', name:'技术与后期'}
        ];

        var html = '';

        // Update shared toolbar
        _updateToolbar(mood);

        // ---- Prompts at top (CN/EN 切换) ----
        if(mood.prompt || mood.prompt_zh){
            html += '<div class="plan-prompts">'+
                '<div class="plan-prompt-block">'+
                    '<div class="plan-prompt-label" onclick="Plan._togglePrompt(this)">'+
                        '<span class="plan-prompt-title">Prompt</span>'+
                        '<span class="plan-lang-toggle">'+
                            '<button class="plan-lang-btn active" data-lang="cn" onclick="Plan.switchLang(\'cn\', event)">CN</button>'+
                            '<button class="plan-lang-btn" data-lang="en" onclick="Plan.switchLang(\'en\', event)">EN</button>'+
                        '</span>'+
                        '<span class="plan-collapse-arrow">▼</span>'+
                    '</div>'+
                    '<textarea class="plan-prompt-text" data-key="prompt" placeholder="请输入 Prompt"></textarea>'+
                    '<div class="plan-prompt-actions"><button class="plan-gen-btn" onclick="Plan.generatePrompt(\''+mood.mood_id+'\')">生成</button></div>'+
                '</div></div>';
        }

        // ---- Intent focus ----
        if(mood.intent_focus && typeof mood.intent_focus === 'object'){
            html += '<div class="plan-section">'+
                '<div class="plan-section-title">方案定位</div>';
            html += _renderIntentFocus(mood.intent_focus);
            html += '</div>';
        }

        // ---- Dimension sections ----
        sections.forEach(function(sec){
            var data = mood[sec.key];
            if(!data || !data.params) return;
            var params = data.params;
            if(typeof params !== 'object' || !Object.keys(params).length) return;
            html += '<div class="plan-section">'+
                '<div class="plan-section-title">'+sec.name+'</div>';
            Object.keys(params).forEach(function(k){
                var p = params[k];
                if(!p || !p.value) return;
                html += '<div class="plan-row"><span class="plan-k">'+_escapeHtml(p.name || k)+'</span><span class="plan-v">'+_escapeHtml(p.value)+'</span></div>';
            });
            html += '</div>';
        });

        container.innerHTML = html;
        container.scrollTop = 0;

        currentMood = mood;
        currentLang = 'cn';
        var ta = container.querySelector('textarea[data-key="prompt"]');
        if(ta) ta.value = currentLang === 'cn' ? (mood.prompt_zh || '') : (mood.prompt || '');

        loadMaterials();
    }

    function generatePrompt(moodId){
        var ta = document.querySelector('textarea[data-key="prompt"]');
        var text = ta ? ta.value.trim() : '';
        if(!text){ alert('Prompt 内容为空'); return; }
        if(!currentMoodPath){ alert('未找到策划文件路径'); return; }

        var btn = document.querySelector('.plan-gen-btn');
        if(btn){ btn.disabled = true; btn.textContent = '生成中...'; }

        fetch('/api/plan/generate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({path: currentMoodPath, mood_id: moodId, prompt: text})
        }).then(function(r){ return r.json(); }).then(function(data){
            if(!data.ok){ throw new Error(data.error || '生成失败'); }
            if(currentMood){
                currentMood.m_list = currentMood.m_list || [];
                currentMood.m_list.push(data.material_id);
            }
            loadMaterials();
            startPolling();
        })['catch'](function(e){
            alert('生成失败: ' + e.message);
        }).then(function(){
            if(btn){ btn.disabled = false; btn.textContent = '生成'; }
        });
    }

    function loadMaterials(silent){
        if(!currentMoodPath || !selectedMoodId) return;
        var container = document.getElementById('planMaterialsList');
        if(!container) return;
        if(!silent){ container.innerHTML = '<div class="detail-empty"><div class="spinner"></div>加载中</div>'; }

        fetch('/api/plan/materials?path='+encodeURIComponent(currentMoodPath)+'&mood_id='+encodeURIComponent(selectedMoodId))
        .then(function(r){ return r.json(); }).then(function(data){
            renderMaterials(data.m_list || []);
        })['catch'](function(e){
            container.innerHTML = '<div class="detail-empty">加载失败: '+e.message+'</div>';
        });
    }

    function renderMaterials(list){
        var container = document.getElementById('planMaterialsList');
        if(!container) return;
        if(!list.length){
            container.innerHTML = '<div class="detail-empty">暂无生成素材</div>';
            stopPolling();
            return;
        }
        var hasPending = list.some(function(m){ return m.status === 'pending' || m.status === 'running'; });
        if(!hasPending){ stopPolling(); }

        // 把所有 material 的 urls 平铺拼接（历史 + 最新一起展示）
        var images = [];
        list.forEach(function(m){
            var urls = m.urls || [];
            if(urls.length){
                urls.forEach(function(u){ images.push({url: u, status: m.status, material_id: m.material_id}); });
            } else {
                images.push({url: '', status: m.status, material_id: m.material_id});
            }
        });

        // 缓存可预览的图片 url 列表，供大图弹框切换
        previewImages = images.filter(function(i){ return i.url; }).map(function(i){ return i.url; });

        container.innerHTML = images.map(function(img){
            if(img.url){
                var src = '/api/plan/image?url=' + encodeURIComponent(img.url);
                return '<div class="plan-img-card">'+
                    '<img class="plan-img-full" src="'+src+'" loading="lazy" alt="" '+
                        'onclick="Plan.previewImage(\''+_escapeHtml(img.url)+'\')">'+
                    '<div class="plan-img-meta">'+_escapeHtml(img.material_id)+'</div>'+
                '</div>';
            }
            if(img.status === 'fail'){
                return '<div class="plan-img-card fail">'+
                    '<div class="plan-img-fail-msg">生成失败</div>'+
                    '<div class="plan-img-meta">'+_escapeHtml(img.material_id)+'</div>'+
                '</div>';
            }
            return '<div class="plan-img-card placeholder"><div class="spinner"></div></div>';
        }).join('');
    }

    function previewImage(url){
        if(!url) return;
        previewIndex = previewImages.indexOf(url);
        if(previewIndex < 0) previewIndex = 0;
        _showPreview();
    }

    function _showPreview(){
        var el = document.getElementById('planViewer');
        var img = document.getElementById('planViewerImg');
        var info = document.getElementById('planViewerInfo');
        if(!el || !img) return;
        var url = previewImages[previewIndex];
        if(!url) return;
        img.src = '/api/plan/image?url=' + encodeURIComponent(url);
        info.textContent = (previewIndex + 1) + ' / ' + previewImages.length;
        el.classList.add('show');
    }

    function prevPreview(event){
        if(event) event.stopPropagation();
        if(!previewImages.length) return;
        previewIndex = (previewIndex - 1 + previewImages.length) % previewImages.length;
        _showPreview();
    }

    function nextPreview(event){
        if(event) event.stopPropagation();
        if(!previewImages.length) return;
        previewIndex = (previewIndex + 1) % previewImages.length;
        _showPreview();
    }

    function closePreview(){
        var el = document.getElementById('planViewer');
        if(el) el.classList.remove('show');
        var img = document.getElementById('planViewerImg');
        if(img) img.src = '';
    }

    function startPolling(){
        stopPolling();
        pollTimer = setInterval(function(){ loadMaterials(true); }, 3000);
    }

    function stopPolling(){
        if(pollTimer){ clearInterval(pollTimer); pollTimer = null; }
    }

    function switchLang(lang, event){
        if(event) event.stopPropagation();
        currentLang = lang;
        document.querySelectorAll('.plan-lang-btn').forEach(function(b){
            b.classList.toggle('active', b.getAttribute('data-lang') === lang);
        });
        var ta = document.querySelector('textarea[data-key="prompt"]');
        if(ta && currentMood){
            ta.value = lang === 'cn' ? (currentMood.prompt_zh || '') : (currentMood.prompt || '');
        }
    }

    function _renderIntentFocus(ifocus){
        var order = [
            {key:'scheme_role', label:'方案角色'},
            {key:'user_intent_alignment', label:'意图对齐'},
            {key:'template_alignment', label:'模板对齐'},
            {key:'primary_variation_axis', label:'主要变化轴'},
            {key:'secondary_variation_axis', label:'次要变化轴'},
            {key:'target_use_case', label:'目标用途'}
        ];
        var html = '';
        order.forEach(function(o){
            if(ifocus[o.key]){
                html += '<div class="plan-row"><span class="plan-k">'+o.label+'</span><span class="plan-v">'+_escapeHtml(ifocus[o.key])+'</span></div>';
            }
        });
        if(ifocus.must_keep && ifocus.must_keep.length){
            html += '<div class="plan-row"><span class="plan-k">必须保留</span><span class="plan-v">'+ifocus.must_keep.map(_escapeHtml).join('、')+'</span></div>';
        }
        if(ifocus.avoid && ifocus.avoid.length){
            html += '<div class="plan-row"><span class="plan-k">必须避免</span><span class="plan-v">'+ifocus.avoid.map(_escapeHtml).join('、')+'</span></div>';
        }
        return html;
    }

    function _togglePrompt(labelEl){
        var block = labelEl.parentElement;
        block.classList.toggle('collapsed');
    }

    function _escapeHtml(str){
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function _updateToolbar(mood){
        var tb = document.getElementById('planToolbar');
        var title = document.getElementById('planToolbarTitle');
        if(tb && title){
            tb.style.display = 'flex';
            title.textContent = mood.title || '';
        }
    }

    document.addEventListener('DOMContentLoaded', function(){ init(); });

    return {
        selectMood: selectMood,
        _togglePrompt: _togglePrompt,
        generatePrompt: generatePrompt,
        switchLang: switchLang,
        previewImage: previewImage,
        prevPreview: prevPreview,
        nextPreview: nextPreview,
        closePreview: closePreview
    };
})();
