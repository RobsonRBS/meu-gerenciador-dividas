const SB_URL = "https://tnogslbfqnviopzrvdbo.supabase.co";
const SB_KEY = "sb_publishable_DPMzaTri6N_tohDN2uQddA_6rp-_1uG";

const app = {
    supabaseClient: null,
    currentUser: null,
    debtsLocal: [],
    expandedIds: new Set(),
    
    promptCallback: null,
    confirmCallback: null,

    init() {
        this.supabaseClient = supabase.createClient(SB_URL, SB_KEY);
        this.supabaseClient.auth.onAuthStateChange((_, session) => {
            if (session) {
                this.currentUser = session.user;
                document.getElementById('userEmail').innerText = this.escapeHtml(this.currentUser.email);
                this.loadDebts();
                document.getElementById('loginScreen').classList.add('hidden');
            } else {
                document.getElementById('loginScreen').classList.remove('hidden');
            }
        });

        document.getElementById('debtForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleDebtSubmit();
        });
    },

    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    },

    sanitizeDebt(debt) {
        return {
            ...debt,
            creditor: this.escapeHtml(debt.creditor),
            debtor: this.escapeHtml(debt.debtor),
            description: this.escapeHtml(debt.description),
        };
    },

    showLoading() {
        document.getElementById('loadingOverlay').classList.remove('hidden');
    },

    hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
    },

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    },

    showModal(id) {
        document.getElementById(id).classList.remove('hidden');
    },

    hideModal(id) {
        document.getElementById(id).classList.add('hidden');
    },

    async handleAuth(type) {
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const errorEl = document.getElementById('authError');

        errorEl.classList.add('hidden');

        if (!this.validateEmail(email)) {
            errorEl.textContent = 'Email inválido';
            errorEl.classList.remove('hidden');
            return;
        }

        if (password.length < 6) {
            errorEl.textContent = 'Senha deve ter pelo menos 6 caracteres';
            errorEl.classList.remove('hidden');
            return;
        }

        this.showLoading();

        try {
            const { error } = type === 'login' 
                ? await this.supabaseClient.auth.signInWithPassword({ email, password })
                : await this.supabaseClient.auth.signUp({ email, password });

            if (error) {
                errorEl.textContent = error.message;
                errorEl.classList.remove('hidden');
            }
        } catch (err) {
            this.showToast('Erro de conexão. Verifique sua internet.', 'error');
        } finally {
            this.hideLoading();
        }
    },

    async logout() {
        this.showLoading();
        await this.supabaseClient.auth.signOut();
        location.reload();
    },

    validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },

    async loadDebts() {
        this.showLoading();
        try {
            const { data, error } = await this.supabaseClient
                .from('debts')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.debtsLocal = data || [];
            this.render();
        } catch (err) {
            this.showToast('Erro ao carregar dívidas', 'error');
        } finally {
            this.hideLoading();
        }
    },

    async handleDebtSubmit() {
        const creditor = document.getElementById('creditor').value.trim();
        const debtor = document.getElementById('debtor').value.trim();
        const description = document.getElementById('description').value.trim();
        const totalValue = parseFloat(document.getElementById('totalValue').value);
        const installmentsCount = parseInt(document.getElementById('installmentsCount').value) || 1;
        const firstDueDate = document.getElementById('firstDueDate').value;

        if (!creditor || !debtor || !totalValue) {
            this.showToast('Preencha os campos obrigatórios', 'error');
            return;
        }

        if (totalValue <= 0) {
            this.showToast('Valor deve ser maior que zero', 'error');
            return;
        }

        const installmentValue = totalValue / installmentsCount;
        const installments = [];

        for (let i = 0; i < installmentsCount; i++) {
            const dueDate = firstDueDate 
                ? new Date(firstDueDate)
                : new Date();
            dueDate.setMonth(dueDate.getMonth() + i);

            installments.push({
                id: i + 1,
                value: installmentValue.toFixed(2),
                status: 'Pendente',
                dueDate: dueDate.toISOString().split('T')[0],
                paidAt: null
            });
        }

        this.showLoading();

        try {
            const { error } = await this.supabaseClient.from('debts').insert({
                creditor,
                debtor,
                description,
                total_value: totalValue,
                installments,
                creator_id: this.currentUser.id,
                shared_with: []
            });

            if (error) throw error;

            this.hideModal('debtModal');
            document.getElementById('debtForm').reset();
            document.getElementById('installmentsCount').value = 1;
            this.showToast('Dívida criada com sucesso!', 'success');
            await this.loadDebts();
        } catch (err) {
            this.showToast('Erro ao criar dívida', 'error');
        } finally {
            this.hideLoading();
        }
    },

    async updateStatus(debtId, instId, status) {
        const debt = this.debtsLocal.find(d => d.id === debtId);
        if (!debt) return;

        const newInsts = debt.installments.map(i => {
            if (i.id === parseInt(instId)) {
                return { 
                    ...i, 
                    status: status, 
                    paidAt: status === 'Pago' ? new Date().toLocaleDateString('pt-BR') : null 
                };
            }
            return i;
        });

        this.showLoading();

        try {
            const { error } = await this.supabaseClient
                .from('debts')
                .update({ installments: newInsts })
                .eq('id', debtId);

            if (error) throw error;
            this.showToast(`Parcela marcada como ${status}`, 'success');
            await this.loadDebts();
        } catch (err) {
            this.showToast('Erro ao atualizar status', 'error');
        } finally {
            this.hideLoading();
        }
    },

    editDate(debtId, instId, type) {
        const debt = this.debtsLocal.find(d => d.id === debtId);
        const inst = debt?.installments.find(i => i.id === parseInt(instId));
        if (!inst) return;

        const fieldLabel = type === 'dueDate' ? 'Vencimento' : 'Pagamento';
        const currentValue = type === 'dueDate' ? inst.dueDate : (inst.paidAt || '');

        this.showPrompt(
            `Nova data (${fieldLabel})`,
            'Use o formato AAAA-MM-DD',
            currentValue,
            (value) => {
                if (!value) return;
                this.updateDateField(debtId, instId, type, value);
            }
        );
    },

    async updateDateField(debtId, instId, type, value) {
        const debt = this.debtsLocal.find(d => d.id === debtId);
        if (!debt) return;

        const newInsts = debt.installments.map(i => {
            if (i.id === parseInt(instId)) {
                return {
                    ...i,
                    [type]: value,
                    status: type === 'paidAt' ? 'Pago' : i.status
                };
            }
            return i;
        });

        this.showLoading();

        try {
            const { error } = await this.supabaseClient
                .from('debts')
                .update({ installments: newInsts })
                .eq('id', debtId);

            if (error) throw error;
            this.showToast('Data atualizada!', 'success');
            await this.loadDebts();
        } catch (err) {
            this.showToast('Erro ao atualizar data', 'error');
        } finally {
            this.hideLoading();
        }
    },

    deleteDebt(id) {
        this.showConfirm(
            'Deseja apagar esta dívida e todas as parcelas permanentemente?',
            async () => {
                this.showLoading();
                try {
                    const { error } = await this.supabaseClient
                        .from('debts')
                        .delete()
                        .eq('id', id);

                    if (error) throw error;
                    this.showToast('Dívida excluída', 'success');
                    await this.loadDebts();
                } catch (err) {
                    this.showToast('Erro ao excluir dívida', 'error');
                } finally {
                    this.hideLoading();
                }
            }
        );
    },

    shareDebt(debtId) {
        this.showPrompt(
            'ID do usuário destino',
            'Cole o ID (UUID) do usuário',
            '',
            async (friendId) => {
                if (!friendId) return;
                
                const debt = this.debtsLocal.find(d => d.id === debtId);
                const updatedShared = Array.from(new Set([...(debt.shared_with || []), friendId]));

                try {
                    const { error } = await this.supabaseClient
                        .from('debts')
                        .update({ shared_with: updatedShared })
                        .eq('id', debtId);

                    if (error) throw error;
                    this.showToast('Dívida compartilhada!', 'success');
                } catch (err) {
                    this.showToast('Erro ao compartilhar', 'error');
                }
            }
        );
    },

    addInstallment(debtId) {
        const debt = this.debtsLocal.find(d => d.id === debtId);
        const lastId = Math.max(...debt.installments.map(i => i.id)) || 0;

        this.showPrompt(
            'Valor da nova parcela',
            'Exemplo: 150.00',
            '',
            (val) => {
                if (!val || isNaN(parseFloat(val))) {
                    this.showToast('Valor inválido', 'error');
                    return;
                }
                this.showPrompt(
                    'Vencimento (AAAA-MM-DD)',
                    'Data no formato ISO',
                    new Date().toISOString().split('T')[0],
                    async (date) => {
                        if (!date) return;
                        
                        const newInsts = [...debt.installments, {
                            id: lastId + 1,
                            value: parseFloat(val).toFixed(2),
                            status: 'Pendente',
                            dueDate: date,
                            paidAt: null
                        }];

                        this.showLoading();
                        try {
                            const { error } = await this.supabaseClient
                                .from('debts')
                                .update({
                                    installments: newInsts,
                                    total_value: parseFloat(debt.total_value) + parseFloat(val)
                                })
                                .eq('id', debtId);

                            if (error) throw error;
                            this.showToast('Parcela adicionada!', 'success');
                            await this.loadDebts();
                        } catch (err) {
                            this.showToast('Erro ao adicionar parcela', 'error');
                        } finally {
                            this.hideLoading();
                        }
                    }
                );
            }
        );
    },

    removeInstallment(debtId, instId) {
        this.showConfirm(
            'Remover esta parcela?',
            async () => {
                const debt = this.debtsLocal.find(d => d.id === debtId);
                const removed = debt.installments.find(i => i.id === parseInt(instId));
                const newInsts = debt.installments.filter(i => i.id !== parseInt(instId));

                this.showLoading();
                try {
                    const { error } = await this.supabaseClient
                        .from('debts')
                        .update({
                            installments: newInsts,
                            total_value: parseFloat(debt.total_value) - parseFloat(removed.value)
                        })
                        .eq('id', debtId);

                    if (error) throw error;
                    this.showToast('Parcela removida', 'success');
                    await this.loadDebts();
                } catch (err) {
                    this.showToast('Erro ao remover parcela', 'error');
                } finally {
                    this.hideLoading();
                }
            }
        );
    },

    showPrompt(title, message, defaultValue, callback) {
        document.getElementById('promptTitle').textContent = title;
        document.getElementById('promptMessage').textContent = message;
        document.getElementById('promptInput').value = defaultValue;
        document.getElementById('promptError').classList.add('hidden');
        
        this.promptCallback = callback;
        this.showModal('promptModal');
        
        setTimeout(() => document.getElementById('promptInput').focus(), 100);
    },

    confirmPrompt() {
        const value = document.getElementById('promptInput').value.trim();
        this.hideModal('promptModal');
        if (this.promptCallback) {
            this.promptCallback(value);
            this.promptCallback = null;
        }
    },

    cancelPrompt() {
        this.hideModal('promptModal');
        this.promptCallback = null;
    },

    showConfirm(message, callback) {
        document.getElementById('confirmMessage').textContent = message;
        this.confirmCallback = callback;
        this.showModal('confirmModal');
    },

    confirmConfirm() {
        this.hideModal('confirmModal');
        if (this.confirmCallback) {
            this.confirmCallback();
            this.confirmCallback = null;
        }
    },

    cancelConfirm() {
        this.hideModal('confirmModal');
        this.confirmCallback = null;
    },

    toggleExpand(id) {
        if (this.expandedIds.has(id)) {
            this.expandedIds.delete(id);
        } else {
            this.expandedIds.add(id);
        }
        this.render();
    },

    showMyId() {
        this.showToast(`Seu ID: ${this.currentUser.id}`, 'info');
    },

    exportMobilePDF(debtId) {
        const { jsPDF } = window.jspdf;
        const d = this.debtsLocal.find(x => x.id === debtId);
        if (!d) return;

        const doc = new jsPDF({ unit: 'mm', format: [100, 250] });
        doc.setFillColor(30, 41, 59);
        doc.rect(0, 0, 100, 35, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.text('EXTRATO DE FLUXO', 10, 15);
        doc.setFontSize(10);
        doc.text(`Credor: ${d.creditor.toUpperCase()}`, 10, 25);
        doc.setTextColor(40);
        doc.setFontSize(12);
        doc.text(`Devedor: ${d.debtor}`, 10, 45);
        
        let y = 60;
        d.installments.forEach(i => {
            doc.setFillColor(245);
            doc.rect(5, y - 5, 90, 25, 'F');
            doc.setFontSize(11);
            doc.text(`R$ ${i.value} (${i.status})`, 10, y + 2);
            doc.setFontSize(9);
            doc.text(`Venc: ${i.dueDate}`, 10, y + 8);
            if (i.paidAt) doc.text(`Pago: ${i.paidAt}`, 10, y + 14);
            y += 30;
        });
        
        doc.save(`Extrato_${d.creditor}.pdf`);
    },

    render() {
        const main = document.getElementById('debtList');
        main.innerHTML = '';

        this.debtsLocal.forEach(d => {
            const safeDebt = this.sanitizeDebt(d);
            const isExp = this.expandedIds.has(d.id);
            const isOwner = d.creator_id === this.currentUser.id;
            const paidVal = d.installments
                .filter(i => i.status === 'Pago')
                .reduce((acc, i) => acc + parseFloat(i.value), 0);
            const totalVal = parseFloat(d.total_value);

            const card = document.createElement('div');
            card.className = "bg-white rounded-[2.5rem] shadow-xl border border-slate-200 overflow-hidden";
            card.innerHTML = `
                <div class="p-6 cursor-pointer" onclick="app.toggleExpand('${d.id}')">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <h3 class="font-black text-slate-800 uppercase text-2xl leading-tight">${safeDebt.creditor}</h3>
                            <p class="text-xs font-black text-slate-400 uppercase tracking-widest">${safeDebt.debtor}</p>
                        </div>
                        <p class="text-lg font-black text-indigo-600 italic">R$ ${totalVal.toFixed(2)}</p>
                    </div>
                    ${safeDebt.description ? `<p class="text-sm font-bold text-slate-500 mb-4 bg-slate-50 p-3 rounded-xl">${safeDebt.description}</p>` : ''}
                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                            <p class="text-[10px] font-black text-emerald-600 uppercase">Pago</p>
                            <p class="text-lg font-black text-emerald-700 leading-none">R$ ${paidVal.toFixed(2)}</p>
                        </div>
                        <div class="bg-rose-50 p-4 rounded-2xl border border-rose-100">
                            <p class="text-[10px] font-black text-rose-600 uppercase">Restante</p>
                            <p class="text-lg font-black text-rose-700 leading-none">R$ ${(totalVal - paidVal).toFixed(2)}</p>
                        </div>
                    </div>
                </div>

                <div class="${isExp ? 'block' : 'hidden'} bg-slate-50 border-t border-slate-200 p-5 space-y-4">
                    <div class="grid grid-cols-2 gap-2">
                        <button onclick="app.exportMobilePDF('${d.id}')" class="py-4 bg-slate-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest">PDF Celular</button>
                        <button onclick="app.addInstallment('${d.id}')" class="py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase">+ Parcela</button>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        ${isOwner ? `<button onclick="app.shareDebt('${d.id}')" class="py-3 bg-white border border-slate-300 text-slate-600 rounded-xl font-black text-[10px] uppercase">Compartilhar</button>` : ''}
                        <button onclick="app.showMyId()" class="py-3 bg-white border border-slate-300 text-slate-600 rounded-xl font-black text-[10px] uppercase">Meu ID</button>
                    </div>

                    <div class="space-y-2">
                        ${d.installments.map(i => `
                            <div class="relative rounded-[1.5rem] overflow-hidden">
                                <div class="swipe-bg-right uppercase">Pago</div>
                                <div class="swipe-bg-left uppercase">Pendente</div>
                                <div class="inst-card p-5 flex items-center justify-between border border-slate-200" 
                                     ontouchstart="app.tS(event)" 
                                     ontouchmove="app.tM(event)" 
                                     ontouchend="app.tE(event, '${d.id}', ${i.id})"
                                     onmousedown="app.tS(event)"
                                     onmousemove="app.tM(event)"
                                     onmouseup="app.tE(event, '${d.id}', ${i.id})">
                                    <div>
                                        <p class="text-xl font-black ${i.status === 'Pago' ? 'text-emerald-500' : 'text-slate-800'}">R$ ${i.value}</p>
                                        <div class="flex gap-4 mt-1">
                                            <p class="text-xs font-bold text-slate-400 cursor-pointer hover:text-indigo-500" onclick="app.editDate('${d.id}', ${i.id}, 'dueDate')">Venc: <span class="underline">${i.dueDate}</span></p>
                                            ${i.paidAt ? `<p class="text-xs font-bold text-emerald-400 cursor-pointer hover:text-indigo-500" onclick="app.editDate('${d.id}', ${i.id}, 'paidAt')">Pago: <span class="underline">${i.paidAt}</span></p>` : ''}
                                        </div>
                                    </div>
                                    <button onclick="app.removeInstallment('${d.id}', ${i.id})" class="text-rose-300 p-2 font-black text-xl hover:text-rose-500">✕</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    ${isOwner ? `<button onclick="app.deleteDebt('${d.id}')" class="w-full py-4 text-rose-500 font-black text-xs uppercase tracking-[0.3em] bg-rose-50 rounded-2xl mt-4">Apagar Fluxo Completo</button>` : ''}
                </div>
            `;
            main.appendChild(card);
        });
    },

    startX: 0,
    currentTarget: null,

    tS(e) {
        this.startX = e.touches ? e.touches[0].clientX : e.clientX;
        this.currentTarget = e.currentTarget;
        this.currentTarget.style.transition = 'none';
    },

    tM(e) {
        if (!this.currentTarget) return;
        let moveX = (e.touches ? e.touches[0].clientX : e.clientX) - this.startX;
        if (Math.abs(moveX) > 100) moveX = moveX > 0 ? 100 : -100;
        this.currentTarget.style.transform = `translateX(${moveX}px)`;
        
        const bgR = this.currentTarget.parentElement.querySelector('.swipe-bg-right');
        const bgL = this.currentTarget.parentElement.querySelector('.swipe-bg-left');
        bgR.style.opacity = moveX > 0 ? 1 : 0;
        bgL.style.opacity = moveX < 0 ? 1 : 0;
    },

    tE(e, debtId, instId) {
        if (!this.currentTarget) return;
        let finalX = (e.changedTouches ? e.changedTouches[0].clientX : e.clientX) - this.startX;
        this.currentTarget.style.transition = 'transform 0.2s ease';
        this.currentTarget.style.transform = 'translateX(0px)';
        
        if (finalX > 70) this.updateStatus(debtId, instId, 'Pago');
        else if (finalX < -70) this.updateStatus(debtId, instId, 'Pendente');
        
        this.currentTarget = null;
    }
};

window.onload = () => app.init();
