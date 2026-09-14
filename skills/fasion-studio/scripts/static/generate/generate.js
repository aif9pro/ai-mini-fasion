// ==================== Generate Tab ====================
var Generate = (function(){
    var config = null;
    var currentFactoryId = '';
    var currentFn = null;
    var historyPage = 1;
    var pageSize = 20;
    var uploading = false;

    // ── Config ──
    function loadConfig(){
        fetch('/api/generate/config').then(function(r){ return r.json(); }).then(function(data){
            config = data;
            populateProviders();
        })['catch'](function(e){
            console.error('加载生成配置失败', e);
        });
    }

    // ── Cascading ──
    var typeEl, providerEl, modelEl, factoryEl, btnEl;
    function _cacheEls(){
        if(!typeEl){ typeEl = document.getElementById('gen-type'); }
        if(!providerEl){ providerEl = document.getElementById('gen-provider'); }
        if(!modelEl){ modelEl = document.getElementById('gen-model'); }
        if(!factoryEl){ factoryEl = document.getElementById('gen-factory'); }
        if(!btnEl){ btnEl = document.getElementById('gen-btn'); }
    }

    function populateProviders(){
        _cacheEls();
        var type = typeEl.value;
        providerEl.innerHTML = '<option value="">请选择 Provider</option>';
        modelEl.innerHTML = '<option value="">请先选择 Provider</option>';
        factoryEl.innerHTML = '<option value="">请先选择 Model</option>';
        modelEl.disabled = true;
        factoryEl.disabled = true;
        btnEl.disabled = true;
        currentFn = null;
        document.getElementById('genParamForm').innerHTML = '<p class="gen-placeholder">请先选择模型</p>';
        if(!type || !config) return;
        var entries = config[type] || [];
        entries.forEach(function(entry){
            providerEl.innerHTML += '<option value="'+entry.source+'">'+entry.source+'</option>';
        });
        providerEl.disabled = false;
    }

    function populateModels(){
        var type = typeEl.value;
        var provider = providerEl.value;
        modelEl.innerHTML = '<option value="">请选择 Model</option>';
        factoryEl.innerHTML = '<option value="">请先选择 Model</option>';
        factoryEl.disabled = true;
        btnEl.disabled = true;
        currentFn = null;
        document.getElementById('genParamForm').innerHTML = '<p class="gen-placeholder">请先选择模型</p>';
        if(!type || !provider || !config) return;
        var entries = (config[type] || []).filter(function(e){ return e.source === provider; });
        entries.forEach(function(entry){
            (entry.models || []).forEach(function(m){
                modelEl.innerHTML += '<option value="'+m.model+'">'+m.model+'</option>';
            });
        });
        modelEl.disabled = false;
    }

    function populateFactories(){
        var type = typeEl.value;
        var provider = providerEl.value;
        var model = modelEl.value;
        factoryEl.innerHTML = '<option value="">请选择 Factory ID</option>';
        btnEl.disabled = true;
        currentFn = null;
        document.getElementById('genParamForm').innerHTML = '<p class="gen-placeholder">请先选择模型</p>';
        if(!type || !provider || !model || !config) return;
        var entries = (config[type] || []).filter(function(e){ return e.source === provider; });
        var fns = [];
        entries.forEach(function(entry){
            (entry.models || []).filter(function(m){ return m.model === model; }).forEach(function(m){
                (m.functions || []).forEach(function(fn){ fns.push(fn); });
            });
        });
        fns.forEach(function(fn){
            factoryEl.innerHTML += '<option value="'+fn.factory_id+'">'+fn.factory_id+' ('+fn.name+')</option>';
        });
        factoryEl.disabled = false;
    }

    function onFactoryChange(){
        var fid = factoryEl.value;
        currentFactoryId = fid;
        currentFn = null;
        if(!fid || !config){
            document.getElementById('genParamForm').innerHTML = '<p class="gen-placeholder">请先选择模型</p>';
            btnEl.disabled = true;
            return;
        }
        var type = typeEl.value;
        var provider = providerEl.value;
        var model = modelEl.value;
        var entries = (config[type] || []).filter(function(e){ return e.source === provider; });
        var fn = null;
        entries.forEach(function(entry){
            (entry.models || []).filter(function(m){ return m.model === model; }).forEach(function(m){
                var found = (m.functions || []).find(function(f){ return f.factory_id === fid; });
                if(found) fn = found;
            });
        });
        currentFn = fn;
        if(fn){ renderParams(fn.params || {}); }
        btnEl.disabled = false;
    }

    // ── Param Form ──
    var _pendingUploads = [];

    function renderParams(params){
        var container = document.getElementById('genParamForm');
        var keys = Object.keys(params);
        if(!keys.length){ container.innerHTML = '<p class="gen-placeholder">该模型无额外参数</p>'; return; }
        var html = '';
        _pendingUploads = [];
        keys.forEach(function(key){
            var spec = params[key];
            if(!spec) return;
            var name = key.toLowerCase();
            if(name.includes('audio_url') || name.includes('voice')){
                html += '<div class="param-group" data-upload-placeholder="'+_esc(key)+'" data-accept="audio/*"></div>';
                _pendingUploads.push({key: key, accept: 'audio/*'});
            } else if(_isImageUrlParam(name)){
                html += '<div class="param-group" data-upload-placeholder="'+_esc(key)+'" data-accept="image/*"></div>';
                _pendingUploads.push({key: key, accept: 'image/*'});
            } else if(spec.enum && Array.isArray(spec.enum)){
                html += _renderSelect(key, spec);
            } else if(spec.type === 'bool'){
                html += _renderBool(key, spec);
            } else if(key === 'prompt' || (spec.type === 'str' && spec.default && spec.default.length > 60)){
                html += _renderTextarea(key, spec);
            } else {
                html += _renderInput(key, spec);
            }
        });
        container.innerHTML = html;
        _pendingUploads.forEach(function(u){
            var placeholder = container.querySelector('[data-upload-placeholder="'+_esc(u.key)+'"]');
            if(placeholder) _renderUploadField(placeholder, u.accept, u.key);
        });
    }

    function _renderSelect(key, spec){
        var required = spec.required ? '<span class="required">*</span>' : '';
        var h = '<div class="param-group"><label class="param-label">'+_esc(key)+required+'</label>';
        h += '<select class="param-select" data-param="'+_esc(key)+'">';
        spec.enum.forEach(function(v){
            var sel = String(v) === String(spec.default) ? ' selected' : '';
            h += '<option value="'+_esc(v)+'"'+sel+'>'+_esc(v)+'</option>';
        });
        h += '</select>';
        if(spec.note) h += '<div class="param-note">'+_esc(spec.note)+'</div>';
        h += '</div>';
        return h;
    }

    function _renderBool(key, spec){
        var chk = spec.default === true ? ' checked' : '';
        return '<div class="param-group"><label class="param-label"><input type="checkbox" class="param-check" data-param="'+_esc(key)+'"'+chk+'> '+_esc(key)+'</label>'+(spec.note?'<div class="param-note">'+_esc(spec.note)+'</div>':'')+'</div>';
    }

    function _renderTextarea(key, spec){
        var val = spec.default || '';
        return '<div class="param-group"><label class="param-label">'+_esc(key)+(spec.required?'<span class="required">*</span>':'')+'</label><textarea class="param-textarea" data-param="'+_esc(key)+'">'+_esc(String(val))+'</textarea>'+(spec.note?'<div class="param-note">'+_esc(spec.note)+'</div>':'')+'</div>';
    }

    function _renderInput(key, spec){
        var val = spec.default !== null && spec.default !== undefined ? spec.default : '';
        return '<div class="param-group"><label class="param-label">'+_esc(key)+(spec.required?'<span class="required">*</span>':'')+'</label><input class="param-input" data-param="'+_esc(key)+'" value="'+_esc(String(val))+'" placeholder="'+(spec.note||'')+'">'+(spec.note?'<div class="param-note">'+_esc(spec.note)+'</div>':'')+'</div>';
    }

    // ── Upload Field ──
    function _isImageUrlParam(name){
        return name.includes('image_url') || name.includes('sref_url') || name === 'imageurl' || name.includes('reference_image');
    }

    function _renderUploadField(placeholder, accept, paramName){
        placeholder.innerHTML = '';
        placeholder.setAttribute('data-param-group', paramName);

        var wrap = document.createElement('div');
        wrap.className = 'upload-wrap';

        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = accept;
        fileInput.className = 'upload-file-input';

        var selectBtn = document.createElement('button');
        selectBtn.className = 'upload-btn';
        selectBtn.textContent = '📁 选择文件';
        selectBtn.onclick = function(){ fileInput.click(); };

        var uploadBtn = document.createElement('button');
        uploadBtn.className = 'upload-btn';
        uploadBtn.textContent = '⬆ 上传';
        uploadBtn.style.display = 'none';

        wrap.appendChild(selectBtn);
        wrap.appendChild(uploadBtn);
        wrap.appendChild(fileInput);

        var label = document.createElement('label');
        label.className = 'param-label';
        label.textContent = paramName;
        placeholder.appendChild(label);
        placeholder.appendChild(wrap);

        var statusArea = document.createElement('div');
        statusArea.className = 'upload-status-area';
        placeholder.appendChild(statusArea);

        var progressWrap = document.createElement('div');
        progressWrap.className = 'upload-progress';
        progressWrap.style.display = 'none';
        progressWrap.innerHTML = '<div class="upload-progress-bar"><div class="upload-progress-fill"></div></div><div class="upload-progress-text">0%</div>';
        placeholder.appendChild(progressWrap);

        var preview = document.createElement('div');
        preview.className = 'upload-preview';
        placeholder.appendChild(preview);

        var selectedFile = null;
        var uploaded = false;

        function setState(state, data){
            statusArea.innerHTML = '';
            progressWrap.style.display = 'none';
            switch(state){
                case 'selected':
                    if(!selectedFile) return;
                    var sizeKB = (selectedFile.size / 1024).toFixed(1);
                    statusArea.innerHTML = '<div class="upload-status state-ready"><span class="file-icon">📄</span><span class="file-info"><span class="file-name">'+_esc(selectedFile.name)+'</span><span class="file-size">'+sizeKB+' KB</span></span><span class="status-badge">待上传</span></div>';
                    selectBtn.style.display = 'none';
                    uploadBtn.style.display = 'inline-block';
                    break;
                case 'uploading':
                    uploading = true;
                    selectBtn.style.display = 'none';
                    uploadBtn.style.display = 'none';
                    statusArea.innerHTML = '<div class="upload-status state-uploading"><span class="file-icon">📄</span><span class="file-info"><span class="file-name">'+_esc(selectedFile.name)+'</span><span class="file-size">上传中...</span></span><span class="status-badge">⬆ 上传中</span></div>';
                    progressWrap.style.display = 'flex';
                    break;
                case 'success':
                    uploading = false; uploaded = true;
                    selectBtn.style.display = 'none';
                    uploadBtn.style.display = 'none';
                    statusArea.innerHTML = '<div class="upload-status state-success"><span class="file-icon">✅</span><span class="file-info"><span class="file-name">'+_esc(selectedFile.name)+'</span><span class="file-size">已完成</span></span><span class="status-badge">✓ 已上传</span></div>';
                    progressWrap.style.display = 'none';
                    placeholder.setAttribute('data-uploaded-url', data.url || '');
                    placeholder.setAttribute('data-uploaded-path', data.path || '');
                    if(accept === 'image/*'){
                        preview.innerHTML = '<img src="'+data.url+'" alt="preview">';
                    } else if(accept === 'audio/*'){
                        preview.innerHTML = '<audio controls src="'+data.url+'"></audio>';
                    }
                    break;
                case 'error':
                    uploading = false;
                    selectBtn.style.display = 'inline-block';
                    uploadBtn.style.display = 'inline-block';
                    uploadBtn.textContent = '⬆ 重试';
                    uploadBtn.style.borderColor = 'var(--red)'; uploadBtn.style.color = 'var(--red)';
                    statusArea.innerHTML = '<div class="upload-status state-error"><span class="file-icon">❌</span><span class="file-info"><span class="file-name">'+_esc(selectedFile.name)+'</span><span class="file-size">'+_esc(data||'上传失败')+'</span></span><span class="status-badge">失败</span></div>';
                    progressWrap.style.display = 'none';
                    break;
            }
        }

        fileInput.onchange = function(){
            selectedFile = fileInput.files[0];
            uploaded = false;
            if(selectedFile) setState('selected');
        };

        uploadBtn.onclick = function(){
            if(!selectedFile || uploading) return;
            setState('uploading');
            var fd = new FormData();
            fd.append('file', selectedFile);
            var xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/upload');
            xhr.upload.onprogress = function(e){
                if(e.lengthComputable){
                    var pct = Math.round(e.loaded / e.total * 100);
                    var fill = progressWrap.querySelector('.upload-progress-fill');
                    var txt = progressWrap.querySelector('.upload-progress-text');
                    if(fill) fill.style.width = pct + '%';
                    if(txt) txt.textContent = pct + '%';
                }
            };
            xhr.onload = function(){
                if(xhr.status === 200){
                    try{
                        var res = JSON.parse(xhr.responseText);
                        if(res.ok) setState('success', res);
                        else setState('error', res.error || '上传失败');
                    }catch(e){ setState('error', '解析响应失败'); }
                } else { setState('error', 'HTTP '+xhr.status); }
            };
            xhr.onerror = function(){ setState('error', '网络错误'); };
            xhr.send(fd);
        };
    }

    // ── Collect params ──
    function _collectParams(){
        var params = {};
        document.querySelectorAll('#genParamForm [data-param]').forEach(function(el){
            var key = el.getAttribute('data-param');
            if(el.type === 'checkbox'){ params[key] = el.checked; }
            else { params[key] = el.value; }
        });
        // Collect uploaded URLs
        document.querySelectorAll('#genParamForm [data-uploaded-url]').forEach(function(el){
            var key = el.getAttribute('data-param-group');
            if(key) params[key] = el.getAttribute('data-uploaded-url');
        });
        return params;
    }

    // ── Generate ──
    function run(){
        var fid = factoryEl.value;
        if(!fid){ alert('请先选择模型'); return; }
        var params = _collectParams();
        var count = parseInt(document.getElementById('gen-count').value) || 1;

        btnEl.disabled = true;
        btnEl.textContent = '⏳ 提交中...';
        var center = document.getElementById('genCenter');
        center.innerHTML = '<div class="gen-spinner"></div><p class="gen-placeholder">正在提交生成任务...</p>';

        fetch('/api/generate', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({factory_id: fid, kwargs: params, count: count})
        }).then(function(r){ return r.json(); }).then(function(res){
            if(!res.ok) throw new Error(res.error||'failed');
            var ids = (res.results || []).map(function(r){ return r.local_id; }).filter(Boolean);
            if(!ids.length) throw new Error('no local_id returned');
            _pollGenerate(ids);
        })['catch'](function(e){
            center.innerHTML = '<p class="gen-placeholder" style="color:var(--red)">提交失败: '+_esc(e.message)+'</p>';
            btnEl.disabled = false;
            btnEl.textContent = '🚀 开始生成';
        });
    }

    function _renderResultList(items, emptyText){
        var center = document.getElementById('genCenter');
        var list = (items || []).filter(function(item){ return item && (item.url || item.type === 'error'); });
        if(!list.length){
            center.innerHTML = '<p class="gen-placeholder">'+_esc(emptyText || '暂无结果')+'</p>';
            return;
        }
        center.innerHTML = '<div class="gen-result-list">'+list.map(function(r, idx){
            var title = _esc(r.id ? (r.id + ' · #' + (idx + 1)) : ('结果 #' + (idx + 1)));
            if(r.type === 'error'){
                return '<div class="gen-result-item error"><div class="gen-result-meta">'+title+'</div><p class="gen-placeholder" style="color:var(--red)">❌ '+_esc(r.error||'失败')+'</p></div>';
            }
            var media = '';
            if(r.type === 'video') media = '<video controls src="'+_esc(r.url)+'"></video>';
            else if(r.type === 'audio') media = '<audio controls src="'+_esc(r.url)+'"></audio>';
            else media = '<img src="'+_esc(r.url)+'" alt="generated">';
            return '<div class="gen-result-item"><div class="gen-result-meta">'+title+'</div>'+media+'</div>';
        }).join('')+'</div>';
    }

    function _pollGenerate(localIds){
        var center = document.getElementById('genCenter');
        var maxPolls = 120;
        var polled = 0;
        var pending = localIds.slice();
        var results = [];

        function poll(){
            polled++;
            if(!pending.length || polled > maxPolls){
                if(polled > maxPolls) center.innerHTML = '<p class="gen-placeholder" style="color:var(--amber)">⏱ 轮询超时，请查看历史记录</p>';
                btnEl.disabled = false;
                btnEl.textContent = '🚀 开始生成';
                loadHistory(1);
                return;
            }

            var checkCount = pending.length;
            var checked = 0;
            pending.forEach(function(lid){
                fetch('/api/generate/status?local_id='+encodeURIComponent(lid)).then(function(r){ return r.json(); }).then(function(res){
                    checked++;
                    if(res.status === 'succeed'){
                        pending = pending.filter(function(id){ return id !== lid; });
                        var items = Array.isArray(res.results) && res.results.length ? res.results : [{url: res.url || '', type: res.type || 'image', path: res.path || ''}];
                        items.forEach(function(item){
                            results.push({id: lid, url: item.url || '', type: item.type || 'image', path: item.path || ''});
                        });
                    } else if(res.status === 'fail'){
                        pending = pending.filter(function(id){ return id !== lid; });
                        results.push({id: lid, url: '', type: 'error', error: res.error || '失败'});
                    }
                    if(checked >= checkCount){
                        if(!pending.length){
                            _renderResultList(results, '✅ 生成完成');
                            btnEl.disabled = false;
                            btnEl.textContent = '🚀 开始生成';
                            loadHistory(1);
                        } else {
                            center.innerHTML = '<div class="gen-spinner"></div><p class="gen-placeholder">生成中... '+results.length+'/'+localIds.length+' ('+polled+'/'+maxPolls+')</p>';
                            setTimeout(poll, 3000);
                        }
                    }
                })['catch'](function(){
                    checked++;
                });
            });
        }
        poll();
    }

    // ── History ──
    function loadHistory(page){
        if(page) historyPage = page;
        var container = document.getElementById('genHistoryList');
        container.innerHTML = '<p class="gen-placeholder">加载中...</p>';
        var typeFilter = document.getElementById('gen-flt-type').value;
        var statusFilter = document.getElementById('gen-flt-status').value;
        var params = 'page='+historyPage+'&size='+pageSize;
        if(typeFilter) params += '&type='+typeFilter;
        if(statusFilter) params += '&status='+statusFilter;
        fetch('/api/history?'+params).then(function(r){ return r.json(); }).then(function(data){
            var items = data.items || [];
            if(!items.length){ container.innerHTML = '<p class="gen-placeholder">暂无记录</p>'; return; }
            container.innerHTML = items.map(function(item){
                var statusClass = item.status === 'succeed' ? 'succeed' : item.status === 'pending' ? 'pending' : item.status === 'running' ? 'running' : 'fail';
                var thumb = item.url ? '<div class="gen-history-thumb"><img src="'+item.url+'" alt=""></div>' : '';
                return '<div class="gen-history-item" onclick="Generate._selectHistory(\''+_esc(item.id)+'\')" data-history-id="'+_esc(item.id)+'">'+
                    '<div class="gen-history-header"><span class="gen-history-status '+statusClass+'">'+_esc(item.status)+'</span><span class="gen-history-time">'+_esc(item.time||'')+'</span></div>'+
                    '<div class="gen-history-desc">'+_esc(item.factory_id)+'</div>'+thumb+'</div>';
            }).join('');
            document.getElementById('gen-pager-info').textContent = data.page+' / '+data.pages;
            document.getElementById('gen-pager-prev').disabled = (data.page <= 1);
            document.getElementById('gen-pager-next').disabled = (data.page >= data.pages);
        })['catch'](function(e){
            container.innerHTML = '<p class="gen-placeholder">加载失败</p>';
        });
    }

    function _selectHistory(id){
        document.querySelectorAll('.gen-history-item').forEach(function(el){ el.classList.remove('selected'); });
        var el = document.querySelector('.gen-history-item[data-history-id="'+id+'"]');
        if(el) el.classList.add('selected');
        fetch('/api/history/detail?id='+encodeURIComponent(id)).then(function(r){ return r.json(); }).then(function(item){
            var results = Array.isArray(item.results) && item.results.length ? item.results : [{url: item.url || '', type: item.type || 'image', path: item.path || ''}];
            _renderResultList(results.map(function(r){
                return {id: item.id || id, url: r.url || '', type: r.type || 'image', path: r.path || ''};
            }), '暂无历史结果');
        })['catch'](function(){});
    }

    function pagePrev(){ if(historyPage > 1) loadHistory(historyPage - 1); }
    function pageNext(){ loadHistory(historyPage + 1); }

    function _esc(s){
        var d = document.createElement('div');
        d.appendChild(document.createTextNode(String(s)));
        return d.innerHTML;
    }

    // ── Init ──
    document.addEventListener('DOMContentLoaded', function(){
        _cacheEls();
        typeEl.addEventListener('change', populateProviders);
        providerEl.addEventListener('change', populateModels);
        modelEl.addEventListener('change', populateFactories);
        factoryEl.addEventListener('change', onFactoryChange);
        loadConfig();
        loadHistory(1);
    });

    return {
        loadConfig: loadConfig,
        run: run,
        loadHistory: loadHistory,
        pagePrev: pagePrev,
        pageNext: pageNext,
        _selectHistory: _selectHistory
    };
})();
