const SB_URL = "https://tnogslbfqnviopzrvdbo.supabase.co";
const SB_KEY = "sb_publishable_DPMzaTri6N_tohDN2uQddA_6rp-_1uG";

const app = {
    supabaseClient: null,
    currentUser: null,
    debtsLocal: [],
    expandedIds: new Set(),
    selectedInstallments: new Set(),
    selectionMode: false,
    compactMode: new Set(),
    lastSelectedId: null,
    
    promptCallback: null,
    confirmCallback: null,
    datePickerCallback: null,
    datePickerContext: null,
    usersList: [],
    shareContext: null,

    init() {
        this.supabaseClient = supabase.createClient(SB_URL, SB_KEY);
        this.supabaseClient.auth.onAuthStateChange((_, session) => {
            if (session) {
                this.currentUser = session.user;
                document.getElementById('userEmail').innerText = this.escapeHtml(this.currentUser.email);
                this.loadDebts();
                this.loadUsers();
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

    showResetPasswordModal() {
        document.getElementById('resetEmail').value = document.getElementById('email').value;
        document.getElementById('resetError').classList.add('hidden');
        this.showModal('resetPasswordModal');
    },

    async resetPassword() {
        const email = document.getElementById('resetEmail').value.trim();
        const errorEl = document.getElementById('resetError');
        
        if (!this.validateEmail(email)) {
            errorEl.textContent = 'Email inválido';
            errorEl.classList.remove('hidden');
            return;
        }

        this.showLoading();
        try {
            const { error } = await this.supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/'
            });

            if (error) {
                errorEl.textContent = error.message;
                errorEl.classList.remove('hidden');
            } else {
                this.hideModal('resetPasswordModal');
                this.showToast('Email de recuperação enviado!', 'success');
            }
        } catch (err) {
            this.showToast('Erro ao enviar email', 'error');
        } finally {
            this.hideLoading();
        }
    },

    showSettingsModal() {
        this.showModal('settingsModal');
    },

    showChangePasswordModal() {
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        document.getElementById('passwordError').classList.add('hidden');
        this.hideModal('settingsModal');
        this.showModal('changePasswordModal');
    },

    async changePassword() {
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const errorEl = document.getElementById('passwordError');

        if (newPassword.length < 6) {
            errorEl.textContent = 'Senha deve ter pelo menos 6 caracteres';
            errorEl.classList.remove('hidden');
            return;
        }

        if (newPassword !== confirmPassword) {
            errorEl.textContent = 'As senhas não coincidem';
            errorEl.classList.remove('hidden');
            return;
        }

        this.showLoading();
        try {
            const { error } = await this.supabaseClient.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;

            this.hideModal('changePasswordModal');
            this.showToast('Senha alterada com sucesso!', 'success');
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
        } finally {
            this.hideLoading();
        }
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

    async loadUsers() {
        try {
            let { data, error } = await this.supabaseClient
                .from('profiles')
                .select('id, email');
            
            console.log('Profiles data:', data, error);
            
            if (!data || data.length === 0) {
                console.log('Profiles vazio, buscando de auth.users...');
                const { data: authData } = await this.supabaseClient
                    .from('auth.users')
                    .select('id, email');
                
                if (authData) {
                    console.log('Auth users:', authData);
                    this.usersList = authData.filter(u => u.id !== this.currentUser?.id);
                }
            } else {
                this.usersList = data.filter(u => u.id !== this.currentUser?.id);
            }
            
            console.log('Users list:', this.usersList);
        } catch (err) {
            console.log('Erro ao carregar usuários:', err);
            this.usersList = [];
        }
    },

    formatDateForDisplay(dateTimeStr) {
        if (!dateTimeStr) return '';
        const [datePart] = dateTimeStr.split('T');
        if (!datePart) return dateTimeStr;
        const [year, month, day] = datePart.split('-');
        return `${day}/${month}/${year}`;
    },

    formatDateTimeForDisplay(dateTimeStr) {
        if (!dateTimeStr) return '';
        const [datePart, timePart] = dateTimeStr.split('T');
        if (!datePart) return dateTimeStr;
        
        const [year, month, day] = datePart.split('-');
        if (timePart) {
            const [hour, minute] = timePart.split(':');
            return `${day}/${month}/${year} ${hour}:${minute}`;
        }
        return `${day}/${month}/${year}`;
    },

    parseDateTime(value) {
        if (!value) return null;
        const dt = new Date(value);
        if (isNaN(dt.getTime())) return null;
        
        const year = dt.getFullYear();
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        const hours = String(dt.getHours()).padStart(2, '0');
        const minutes = String(dt.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day}T${hours}:${minutes}`;
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
            let dueDate;
            if (firstDueDate) {
                const baseDate = new Date(firstDueDate);
                baseDate.setMonth(baseDate.getMonth() + i);
                dueDate = baseDate.toISOString().slice(0, 16);
            } else {
                const baseDate = new Date();
                baseDate.setMonth(baseDate.getMonth() + i);
                dueDate = baseDate.toISOString().slice(0, 16);
            }

            installments.push({
                id: i + 1,
                value: installmentValue.toFixed(2),
                status: 'Pendente',
                dueDate: dueDate,
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
                    paidAt: status === 'Pago' ? new Date().toISOString().slice(0, 16) : null 
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

        const titleEl = document.getElementById('datePickerTitle');
        titleEl.textContent = `${fieldLabel}`;

        const dateInput = document.getElementById('datePickerDate');
        const timeInput = document.getElementById('datePickerTime');

        if (currentValue && currentValue.includes('T')) {
            const [datePart, timePart] = currentValue.split('T');
            dateInput.value = datePart;
            timeInput.value = timePart || '00:00';
        } else if (currentValue) {
            dateInput.value = currentValue;
            timeInput.value = '00:00';
        } else {
            const now = new Date();
            dateInput.value = now.toISOString().split('T')[0];
            timeInput.value = '00:00';
        }

        this.datePickerContext = { debtId, instId, type };
        this.showModal('datePickerModal');
    },

    handleDatePickerConfirm() {
        const dateInput = document.getElementById('datePickerDate').value;
        const timeInput = document.getElementById('datePickerTime').value;

        if (!dateInput) {
            this.showToast('Selecione uma data', 'error');
            return;
        }

        const dateTime = `${dateInput}T${timeInput || '00:00'}`;
        this.hideModal('datePickerModal');

        if (this.datePickerContext?.mode === 'addInstallment') {
            const { debtId, lastId, value } = this.datePickerContext;
            const debt = this.debtsLocal.find(d => d.id === debtId);

            const newInsts = [...debt.installments, {
                id: lastId + 1,
                value: parseFloat(value).toFixed(2),
                status: 'Pendente',
                dueDate: dateTime,
                paidAt: null
            }];

            this.showLoading();

            (async () => {
                try {
                    const { error } = await this.supabaseClient
                        .from('debts')
                        .update({
                            installments: newInsts,
                            total_value: parseFloat(debt.total_value) + parseFloat(value)
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
            })();
        } else if (this.datePickerContext?.mode === 'addMultipleInstallments') {
            const { debtId, lastId, value, count } = this.datePickerContext;
            const debt = this.debtsLocal.find(d => d.id === debtId);
            
            const newInsts = [...debt.installments];
            const baseDate = new Date(dateTime);

            for (let i = 0; i < count; i++) {
                const instDate = new Date(baseDate);
                instDate.setMonth(instDate.getMonth() + i);
                newInsts.push({
                    id: lastId + 1 + i,
                    value: parseFloat(value).toFixed(2),
                    status: 'Pendente',
                    dueDate: instDate.toISOString().slice(0, 16),
                    paidAt: null
                });
            }

            this.showLoading();

            (async () => {
                try {
                    const { error } = await this.supabaseClient
                        .from('debts')
                        .update({
                            installments: newInsts,
                            total_value: parseFloat(debt.total_value) + (parseFloat(value) * count)
                        })
                        .eq('id', debtId);

                    if (error) throw error;
                    this.showToast(`${count} parcelas adicionadas!`, 'success');
                    await this.loadDebts();
                } catch (err) {
                    this.showToast('Erro ao adicionar parcelas', 'error');
                } finally {
                    this.hideLoading();
                }
            })();
        } else if (this.datePickerContext) {
            const { debtId, instId, type } = this.datePickerContext;
            this.updateDateField(debtId, instId, type, dateTime);
        }
        
        this.datePickerContext = null;
    },

    confirmDatePicker() {
        this.handleDatePickerConfirm();
    },

    cancelDatePicker() {
        this.hideModal('datePickerModal');
        this.datePickerContext = null;
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
        const debt = this.debtsLocal.find(d => d.id === debtId);
        const sharedWith = debt.shared_with || [];
        
        this.shareContext = { debtId, sharedWith };
        
        const userListEl = document.getElementById('userList');
        userListEl.innerHTML = '';
        
        const availableUsers = this.usersList.filter(u => !sharedWith.includes(u.id));
        
        if (availableUsers.length === 0) {
            userListEl.innerHTML = `
                <p class="text-center text-slate-400 py-2">Nenhum usuário cadastrado ainda.</p>
                <p class="text-center text-slate-400 text-xs pb-2">Outro usuário precisa criar uma conta primeiro.</p>
            `;
        } else {
            availableUsers.forEach(user => {
                const btn = document.createElement('button');
                btn.className = 'w-full p-3 bg-slate-100 rounded-lg text-left hover:bg-indigo-50 transition';
                btn.innerHTML = `
                    <div class="font-bold text-slate-700">${this.escapeHtml(user.email || 'Usuário')}</div>
                    <div class="text-xs text-slate-400">${user.id}</div>
                `;
                btn.onclick = () => {
                    this.hideModal('userSelectModal');
                    const newShared = [...sharedWith, user.id];
                    this.updateSharedWith(debtId, newShared);
                };
                userListEl.appendChild(btn);
            });
        }
        
        if (sharedWith.length > 0) {
            const divider = document.createElement('div');
            divider.className = 'border-t border-slate-200 my-2';
            divider.innerHTML = '<p class="text-xs text-slate-400 py-2 text-center">Usuários com acesso:</p>';
            userListEl.appendChild(divider);
            
            sharedWith.forEach(userId => {
                const user = this.usersList.find(u => u.id === userId);
                const btn = document.createElement('button');
                btn.className = 'w-full p-3 bg-rose-50 rounded-lg text-left hover:bg-rose-100 transition';
                btn.innerHTML = `
                    <div class="font-bold text-rose-700">${user ? this.escapeHtml(user.email) : 'Remover acesso'}</div>
                    <div class="text-xs text-rose-400">${userId}</div>
                `;
                btn.onclick = () => {
                    const newShared = sharedWith.filter(id => id !== userId);
                    this.hideModal('userSelectModal');
                    this.updateSharedWith(debtId, newShared);
                };
                userListEl.appendChild(btn);
            });
        }
        
        this.showModal('userSelectModal');
    },

    async updateSharedWith(debtId, updatedShared) {
        try {
            const { error } = await this.supabaseClient
                .from('debts')
                .update({ shared_with: updatedShared })
                .eq('id', debtId);

            if (error) throw error;
            this.showToast(updatedShared.length > 0 ? 'Dívida compartilhada!' : 'Compartilhamento removido!', 'success');
            await this.loadDebts();
        } catch (err) {
            this.showToast('Erro ao atualizar compartilhamento', 'error');
        }
    },

    addInstallment(debtId) {
        const debt = this.debtsLocal.find(d => d.id === debtId);
        const lastId = Math.max(...debt.installments.map(i => i.id)) || 0;
        const lastInst = debt.installments.length > 0 ? debt.installments[debt.installments.length - 1] : null;
        const defaultValue = lastInst ? lastInst.value : '';

        this.showPrompt(
            'Valor da nova parcela',
            'Valor de cada parcela',
            defaultValue,
            (val) => {
                if (!val || isNaN(parseFloat(val))) {
                    this.showToast('Valor inválido', 'error');
                    return;
                }

                const dateInput = document.getElementById('datePickerDate');
                const timeInput = document.getElementById('datePickerTime');
                
                dateInput.value = new Date().toISOString().split('T')[0];
                timeInput.value = '00:00';

                const titleEl = document.getElementById('datePickerTitle');
                titleEl.textContent = 'Vencimento';

                this.datePickerContext = { 
                    debtId, 
                    lastId, 
                    value: val,
                    mode: 'addInstallment'
                };
                this.showModal('datePickerModal');
            }
        );
    },

    addMultipleInstallments(debtId) {
        const debt = this.debtsLocal.find(d => d.id === debtId);
        const lastId = Math.max(...debt.installments.map(i => i.id)) || 0;
        const lastInst = debt.installments.length > 0 ? debt.installments[debt.installments.length - 1] : null;
        const defaultValue = lastInst ? lastInst.value : '';

        this.showPrompt(
            'Adicionar Múltiplas Parcelas',
            'Quantas parcelas deseja adicionar?',
            '1',
            (countStr) => {
                const count = parseInt(countStr);
                if (!count || count < 1 || count > 60) {
                    this.showToast('Quantidade inválida (1-60)', 'error');
                    return;
                }

                this.showPrompt(
                    'Valor de cada parcela',
                    'Valor de cada nova parcela',
                    defaultValue,
                    (val) => {
                        if (!val || isNaN(parseFloat(val))) {
                            this.showToast('Valor inválido', 'error');
                            return;
                        }

                        const dateInput = document.getElementById('datePickerDate');
                        const timeInput = document.getElementById('datePickerTime');
                        
                        dateInput.value = new Date().toISOString().split('T')[0];
                        timeInput.value = '00:00';

                        const titleEl = document.getElementById('datePickerTitle');
                        titleEl.textContent = 'Primeiro Vencimento';

                        this.datePickerContext = { 
                            debtId, 
                            lastId, 
                            value: val,
                            count: count,
                            mode: 'addMultipleInstallments'
                        };
                        this.showModal('datePickerModal');
                    }
                );
            }
        );
    },

    removeInstallment(debtId, instId) {
        const debt = this.debtsLocal.find(d => d.id === debtId);
        const removed = debt.installments.find(i => i.id === parseInt(instId));
        const newInsts = debt.installments.filter(i => i.id !== parseInt(instId));

        this.showLoading();
        (async () => {
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
        })();
    },

    editInstallmentValue(debtId, instId) {
        const debt = this.debtsLocal.find(d => d.id === debtId);
        const inst = debt?.installments.find(i => i.id === parseInt(instId));
        if (!inst) return;

        this.showPrompt(
            'Editar Valor',
            'Novo valor da parcela',
            inst.value,
            async (newValue) => {
                if (!newValue || isNaN(parseFloat(newValue))) {
                    this.showToast('Valor inválido', 'error');
                    return;
                }

                const diff = parseFloat(newValue) - parseFloat(inst.value);
                const newInsts = debt.installments.map(i => {
                    if (i.id === parseInt(instId)) {
                        return { ...i, value: parseFloat(newValue).toFixed(2) };
                    }
                    return i;
                });

                this.showLoading();
                try {
                    const { error } = await this.supabaseClient
                        .from('debts')
                        .update({
                            installments: newInsts,
                            total_value: parseFloat(debt.total_value) + diff
                        })
                        .eq('id', debtId);

                    if (error) throw error;
                    this.showToast('Valor atualizado!', 'success');
                    await this.loadDebts();
                } catch (err) {
                    this.showToast('Erro ao atualizar valor', 'error');
                } finally {
                    this.hideLoading();
                }
            }
        );
    },

    editInstallmentNote(debtId, instId) {
        const debt = this.debtsLocal.find(d => d.id === debtId);
        const inst = debt?.installments.find(i => i.id === parseInt(instId));
        if (!inst) return;

        this.showPrompt(
            'Observação',
            'Adicione uma observação para esta parcela',
            inst.note || '',
            async (note) => {
                const newInsts = debt.installments.map(i => {
                    if (i.id === parseInt(instId)) {
                        return { ...i, note: note || null };
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
                    this.showToast('Observação salva!', 'success');
                    await this.loadDebts();
                } catch (err) {
                    this.showToast('Erro ao salvar observação', 'error');
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

        const lineHeight = 7;
        const headerHeight = 30;
        const footerHeight = 10;
        const contentHeight = d.installments.length * lineHeight + footerHeight;
        const pageHeight = Math.max(100, headerHeight + contentHeight + 30);
        
        const doc = new jsPDF({ unit: 'mm', format: [80, pageHeight] });
        doc.setFillColor(30, 41, 59);
        doc.rect(0, 0, 80, 22, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.text('DEBTFLOW', 5, 9);
        doc.setFontSize(9);
        doc.text(`${d.creditor.toUpperCase()}`, 5, 15);
        doc.text(`${d.debtor}`, 5, 19);
        
        let y = 26;
        const paidVal = d.installments.filter(i => i.status === 'Pago').reduce((acc, i) => acc + parseFloat(i.value), 0);
        const totalVal = parseFloat(d.total_value);
        
        doc.setTextColor(0);
        doc.setFontSize(8);
        doc.text(`Total: R$ ${totalVal.toFixed(2)} | Pago: R$ ${paidVal.toFixed(2)}`, 5, y);
        y += 4;
        
        doc.setDrawColor(200);
        doc.line(5, y, 75, y);
        y += 3;
        
        d.installments.forEach(i => {
            doc.setFontSize(9);
            doc.setTextColor(i.status === 'Pago' ? 16 : 220, i.status === 'Pago' ? 185 : 0, i.status === 'Pago' ? 80 : 0);
            doc.text(`R$ ${i.value}`, 5, y);
            doc.setFontSize(7);
            doc.setTextColor(100);
            const displayDate = this.formatDateTimeForDisplay(i.dueDate);
            doc.text(`${displayDate}`, 28, y);
            if (i.status === 'Pago') {
                doc.setTextColor(16, 185, 129);
                doc.text('PAGO', 55, y);
            } else {
                doc.setTextColor(239, 68, 68);
                doc.text('PENDENTE', 50, y);
            }
            if (i.note) {
                doc.setTextColor(100);
                doc.setFontSize(6);
                doc.text(`Obs: ${i.note.substring(0, 25)}${i.note.length > 25 ? '...' : ''}`, 5, y + 3);
                y += lineHeight + 3;
            } else {
                y += lineHeight;
            }
        });
        
        doc.save(`Extrato_${d.creditor}.pdf`);
    },

    render() {
        const main = document.getElementById('debtList');
        main.innerHTML = '';

        this.debtsLocal.forEach(d => {
            const safeDebt = this.sanitizeDebt(d);
            const isExp = this.expandedIds.has(d.id);
            const canEdit = d.creator_id && d.creator_id === this.currentUser.id;
            const isShared = !canEdit && d.creator_id;
            const paidVal = d.installments
                .filter(i => i.status === 'Pago')
                .reduce((acc, i) => acc + parseFloat(i.value), 0);
            const totalVal = parseFloat(d.total_value);

            const card = document.createElement('div');
            card.className = `bg-white rounded-xl shadow-md overflow-hidden ${isShared ? 'border-2 border-blue-300' : 'border border-slate-200'}`;
            card.innerHTML = `
                <div class="p-4 cursor-pointer" onclick="app.toggleExpand('${d.id}')">
                    ${isShared ? '<div class="bg-blue-50 text-blue-600 text-[10px] font-bold uppercase py-1 px-2 rounded mb-2">Compartilhada</div>' : ''}
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <h3 class="font-black text-slate-800 uppercase text-2xl leading-tight">${safeDebt.creditor}</h3>
                            <p class="text-base font-black text-slate-400 uppercase tracking-widest">${safeDebt.debtor}</p>
                        </div>
                        <p class="text-lg font-black text-indigo-600 italic">R$ ${totalVal.toFixed(2)}</p>
                    </div>
                    ${safeDebt.description ? `<p class="text-sm font-bold text-slate-500 mb-4 bg-slate-50 p-3 rounded-xl">${safeDebt.description}</p>` : ''}
                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-emerald-50 p-4 rounded-lg border border-emerald-100">
                            <p class="text-xs font-black text-emerald-600 uppercase">Pago</p>
                            <p class="text-xl font-black text-emerald-700 leading-none">R$ ${paidVal.toFixed(2)}</p>
                        </div>
                        <div class="bg-rose-50 p-4 rounded-lg border border-rose-100">
                            <p class="text-xs font-black text-rose-600 uppercase">Restante</p>
                            <p class="text-xl font-black text-rose-700 leading-none">R$ ${(totalVal - paidVal).toFixed(2)}</p>
                        </div>
                    </div>
                </div>

                <div class="${isExp ? 'block' : 'hidden'} bg-slate-50 border-t border-slate-200 p-5 space-y-4">
                    ${canEdit ? `
                    <div class="grid grid-cols-3 gap-2">
                        <button onclick="app.exportMobilePDF('${d.id}')" class="py-3 text-black rounded-lg font-black text-xs uppercase tracking-wider" style="background-color: #ffca28;">PDF</button>
                        <button onclick="app.addInstallment('${d.id}')" class="py-3 bg-indigo-600 text-white rounded-lg font-black text-xs uppercase">+ 1 Parc</button>
                        <button onclick="app.addMultipleInstallments('${d.id}')" class="py-3 bg-indigo-600 text-white rounded-lg font-black text-xs uppercase">+ Multi</button>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <button onclick="app.shareDebt('${d.id}')" class="py-3 bg-white border border-slate-300 text-slate-600 rounded-xl font-black text-[10px] uppercase">${(d.shared_with || []).length > 0 ? `Compartilhado (${d.shared_with.length})` : 'Compartilhar'}</button>
                        <button onclick="app.showMyId()" class="py-3 bg-white border border-slate-300 text-slate-600 rounded-xl font-black text-[10px] uppercase">Meu ID</button>
                    </div>

                    <div class="flex gap-2 flex-wrap">
                        <button onclick="app.toggleSelectionMode('${d.id}')" class="py-2 px-3 bg-slate-200 text-slate-700 rounded-lg font-black text-xs uppercase">Selecionar</button>
                        <button onclick="app.selectPendingInDebt('${d.id}')" class="py-2 px-3 bg-amber-100 text-amber-700 rounded-lg font-black text-xs uppercase">Pendentes</button>
                        <button onclick="app.selectAllInDebt('${d.id}')" class="py-2 px-3 bg-blue-100 text-blue-700 rounded-lg font-black text-xs uppercase">Todas</button>
                        <button onclick="app.clearSelectionInDebt('${d.id}')" class="py-2 px-3 bg-slate-100 text-slate-500 rounded-lg font-black text-xs uppercase">Limpar</button>
                        ${this.selectedInstallments.size > 0 ? `<button onclick="app.markSelectedAsPaid('${d.id}')" class="py-2 px-3 bg-emerald-500 text-white rounded-lg font-black text-xs uppercase">Pagar (${this.selectedInstallments.size})</button>` : ''}
                    </div>

                    <button onclick="app.toggleCompactMode('${d.id}')" class="w-full py-2 bg-slate-200 text-slate-600 rounded-lg font-bold text-xs uppercase">
                        ${this.compactMode.has(d.id) ? 'Modo Normal' : 'Modo Compacto'}
                    </button>

                    ${(() => {
                        const isCompact = this.compactMode.has(d.id);
                        if (isCompact) {
                            return `<div class="grid grid-cols-6 gap-0.5 text-xs">` + 
                                d.installments.map(i => `
                                    <div onclick="app.toggleCompactInstallment('${d.id}', ${i.id})" class="p-2 rounded cursor-pointer ${i.status === 'Pago' ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-500' : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:border-indigo-300'}">
                                        <div class="font-bold text-xs">R$ ${parseFloat(i.value).toFixed(0)}</div>
                                        <div class="text-[9px]">${i.dueDate ? i.dueDate.split('T')[0].slice(5) : ''}</div>
                                        <div class="text-[8px] mt-1">${i.status === 'Pago' ? '✅' : '⏳'}</div>
                                    </div>
                                `).join('') + 
                                `</div>`;
                        }
                        return `<div class="space-y-1">
                        ${d.installments.map(i => `
                            <div class="relative rounded-lg overflow-hidden">
                                <div class="swipe-bg-right uppercase">Pago</div>
                                <div class="swipe-bg-left uppercase">Pendente</div>
                                <div class="inst-card p-2 flex items-center justify-between border border-slate-200" 
                                     ontouchstart="app.tS(event)" 
                                     ontouchmove="app.tM(event)" 
                                     ontouchend="app.tE(event, '${d.id}', ${i.id})"
                                     onmousedown="app.tS(event)"
                                     onmousemove="app.tM(event)"
                                     onmouseup="app.tE(event, '${d.id}', ${i.id})">
                                    <div class="flex items-center gap-3">
                                        <input type="checkbox" 
                                            onclick="event.stopPropagation(); app.toggleInstallmentSelection('${d.id}', ${i.id}, event)" 
                                            ${this.selectedInstallments.has('${d.id}_${i.id}') ? 'checked' : ''}
                                            class="w-5 h-5 accent-indigo-600">
                                        <div>
                                            <p class="text-lg font-black ${i.status === 'Pago' ? 'text-emerald-500' : 'text-slate-800'} cursor-pointer hover:text-indigo-500" onclick="event.stopPropagation(); app.editInstallmentValue('${d.id}', ${i.id})">R$ ${i.value}</p>
                                            <div class="flex gap-4 mt-1">
                                                <p class="text-xs font-bold text-slate-400 cursor-pointer hover:text-indigo-500" onclick="app.editDate('${d.id}', ${i.id}, 'dueDate')">Venc: <span class="underline">${app.formatDateForDisplay(i.dueDate)}</span></p>
                                                ${i.paidAt ? `<p class="text-xs font-bold text-emerald-400 cursor-pointer hover:text-indigo-500" onclick="app.editDate('${d.id}', ${i.id}, 'paidAt')">Pago: <span class="underline">${app.formatDateTimeForDisplay(i.paidAt)}</span></p>` : ''}
                                            </div>
                                            ${i.note ? `<div class="text-xs font-bold text-slate-500 mt-1 cursor-pointer hover:text-indigo-500" onclick="app.editInstallmentNote('${d.id}', ${i.id})">📝 ${i.note}</div>` : `<div class="text-xs text-slate-300 mt-1 cursor-pointer hover:text-indigo-500" onclick="app.editInstallmentNote('${d.id}', ${i.id})">+ obs</div>`}
                                        </div>
                                    </div>
                                    <button onclick="app.removeInstallment('${d.id}', ${i.id})" class="text-rose-300 p-2 font-black text-xl hover:text-rose-500">✕</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>`;
                    })()}
                    
                    <button onclick="app.deleteDebt('${d.id}')" class="w-full py-3 text-rose-500 font-black text-xs uppercase tracking-[0.3em] bg-rose-50 rounded-lg mt-3">Excluir dívida</button>
                    ` : `
                    <div class="space-y-2">
                        ${d.installments.map(i => `
                            <div class="p-3 flex items-center justify-between border border-slate-200 bg-white rounded-lg">
                                <div>
                                    <p class="text-lg font-black ${i.status === 'Pago' ? 'text-emerald-500' : 'text-slate-800'}">R$ ${i.value}</p>
                                    <div class="flex gap-4 mt-1">
                                        <p class="text-xs font-bold text-slate-400">Venc: ${app.formatDateForDisplay(i.dueDate)}</p>
                                        ${i.paidAt ? `<p class="text-xs font-bold text-emerald-400">Pago: ${app.formatDateTimeForDisplay(i.paidAt)}</p>` : ''}
                                    </div>
                                    ${i.note ? `<div class="text-xs font-bold text-slate-500 mt-1">📝 ${i.note}</div>` : ''}
                                </div>
                                <div class="text-2xl">${i.status === 'Pago' ? '✅' : '⏳'}</div>
                            </div>
                        `).join('')}
                    </div>
                    `}
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
    },

    toggleSelectionMode(debtId) {
        this.selectionMode = !this.selectionMode;
        if (!this.selectionMode) {
            this.selectedInstallments.clear();
        }
        this.render();
    },

    toggleCompactMode(debtId) {
        if (this.compactMode.has(debtId)) {
            this.compactMode.delete(debtId);
        } else {
            this.compactMode.add(debtId);
        }
        this.render();
    },

    toggleCompactInstallment(debtId, instId) {
        const debt = this.debtsLocal.find(d => d.id === debtId);
        if (!debt) return;
        
        const inst = debt.installments.find(i => i.id === parseInt(instId));
        if (!inst) return;
        
        const newStatus = inst.status === 'Pago' ? 'Pendente' : 'Pago';
        this.updateStatus(debtId, instId, newStatus);
    },

    toggleInstallmentSelection(debtId, instId, event) {
        const debt = this.debtsLocal.find(d => d.id === debtId);
        const instIndex = debt.installments.findIndex(i => i.id === parseInt(instId));
        
        if (event && event.shiftKey && this.lastSelectedId !== null) {
            const lastIndex = debt.installments.findIndex(i => i.id === this.lastSelectedId);
            const start = Math.min(instIndex, lastIndex);
            const end = Math.max(instIndex, lastIndex);
            
            for (let i = start; i <= end; i++) {
                const key = `${debtId}_${debt.installments[i].id}`;
                this.selectedInstallments.add(key);
            }
        } else {
            const key = `${debtId}_${instId}`;
            if (this.selectedInstallments.has(key)) {
                this.selectedInstallments.delete(key);
            } else {
                this.selectedInstallments.add(key);
            }
        }
        
        this.lastSelectedId = parseInt(instId);
        this.render();
    },

    selectAllInDebt(debtId) {
        const debt = this.debtsLocal.find(d => d.id === debtId);
        debt.installments.forEach(i => {
            this.selectedInstallments.add(`${debtId}_${i.id}`);
        });
        this.render();
    },

    selectPendingInDebt(debtId) {
        const debt = this.debtsLocal.find(d => d.id === debtId);
        debt.installments.forEach(i => {
            if (i.status !== 'Pago') {
                this.selectedInstallments.add(`${debtId}_${i.id}`);
            }
        });
        this.render();
    },

    clearSelectionInDebt(debtId) {
        const debt = this.debtsLocal.find(d => d.id === debtId);
        debt.installments.forEach(i => {
            this.selectedInstallments.delete(`${debtId}_${i.id}`);
        });
        this.render();
    },

    markSelectedAsPaid(debtId) {
        if (this.selectedInstallments.size === 0) return;

        const debt = this.debtsLocal.find(d => d.id === debtId);
        if (!debt) return;

        const newInsts = debt.installments.map(i => {
            const key = `${debtId}_${i.id}`;
            if (this.selectedInstallments.has(key) && i.status !== 'Pago') {
                return { 
                    ...i, 
                    status: 'Pago', 
                    paidAt: new Date().toISOString().slice(0, 16)
                };
            }
            return i;
        });

        this.showLoading();

        (async () => {
            try {
                const { error } = await this.supabaseClient
                    .from('debts')
                    .update({ installments: newInsts })
                    .eq('id', debtId);

                if (error) throw error;
                
                this.selectedInstallments.clear();
                this.showToast('Parcelas marcadas como pago!', 'success');
                await this.loadDebts();
            } catch (err) {
                this.showToast('Erro ao atualizar parcelas', 'error');
            } finally {
                this.hideLoading();
            }
        })();
    }
};

window.onload = () => app.init();
