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
    activeTab: 'own',
    userName: '',
    globalCompactMode: false,
    searchQuery: '',
    
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
                this.loadUserName();
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
        console.log('Opening reset password modal');
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

    async loadUserName() {
        try {
            const { data, error } = await this.supabaseClient
                .from('profiles')
                .select('display_name')
                .eq('id', this.currentUser.id)
                .single();
            
            if (data?.display_name) {
                this.userName = data.display_name;
                document.getElementById('userEmail').innerText = this.escapeHtml(this.userName);
            }
        } catch (err) {
            console.log('Erro ao carregar nome:', err);
        }
    },

    showEditNameModal() {
        document.getElementById('userDisplayName').value = this.userName || '';
        document.getElementById('nameError').classList.add('hidden');
        this.hideModal('settingsModal');
        this.showModal('editNameModal');
    },

    async saveDisplayName() {
        const name = document.getElementById('userDisplayName').value.trim();
        const errorEl = document.getElementById('nameError');
        
        if (!name) {
            errorEl.textContent = 'Digite um nome';
            errorEl.classList.remove('hidden');
            return;
        }

        this.showLoading();
        try {
            const { error } = await this.supabaseClient
                .from('profiles')
                .upsert({
                    id: this.currentUser.id,
                    email: this.currentUser.email,
                    display_name: name
                }, { onConflict: 'id' });

            if (error) throw error;

            this.userName = name;
            document.getElementById('userEmail').innerText = this.escapeHtml(name);
            this.hideModal('editNameModal');
            this.showToast('Nome salvo!', 'success');
            
            // Recarregar lista de usuários
            this.loadUsers();
        } catch (err) {
            errorEl.textContent = 'Erro ao salvar nome';
            errorEl.classList.remove('hidden');
        } finally {
            this.hideLoading();
        }
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
            let users = [];
            
            // Tentar buscar da tabela profiles
            let { data: profilesData, error: profilesError } = await this.supabaseClient
                .from('profiles')
                .select('id, email, display_name');
            
            if (profilesData && profilesData.length > 0) {
                users = profilesData;
            }
            
            // Se não encontrou, buscar de auth.users via API
            if (users.length === 0) {
                const { data: authData } = await this.supabaseClient.auth.getUser();
                if (authData?.user) {
                    users = [{ id: authData.user.id, email: authData.user.email, display_name: null }];
                }
            }
            
            this.usersList = users.filter(u => u.id !== this.currentUser?.id);
            console.log('Users loaded:', this.usersList);
        } catch (err) {
            console.log('Erro ao carregar usuários:', err);
            this.usersList = [];
        }
    },

    switchTab(tab) {
        this.activeTab = tab;
        const activeClass = 'w-full max-w-xs py-2 px-4 rounded-lg font-bold text-sm uppercase bg-indigo-600 text-white';
        const inactiveClass = 'w-full max-w-xs py-2 px-4 rounded-lg font-bold text-sm uppercase bg-white text-slate-600';
        
        document.getElementById('tab-own').className = tab === 'own' ? activeClass : inactiveClass;
        document.getElementById('tab-shared').className = tab === 'shared' ? activeClass : inactiveClass;
        this.render();
    },

    toggleGlobalCompact() {
        this.globalCompactMode = !this.globalCompactMode;
        const btn = document.getElementById('btnGlobalCompact');
        btn.innerText = `Modo Compacto: ${this.globalCompactMode ? 'ON' : 'OFF'}`;
        btn.className = this.globalCompactMode 
            ? 'px-4 py-2 bg-indigo-600 border border-indigo-600 rounded-lg font-bold text-xs uppercase text-white'
            : 'px-4 py-2 bg-white border border-slate-200 rounded-lg font-bold text-xs uppercase text-slate-600 hover:bg-slate-50';
        this.render();
    },

    handleSearch() {
        this.searchQuery = document.getElementById('searchInput').value.toLowerCase();
        this.render();
    },

    async cloneDebt(debtId) {
        const source = this.debtsLocal.find(d => d.id === debtId);
        if (!source) return;

        this.showConfirm(
            `Deseja clonar esta dívida (${source.creditor} -> ${source.debtor})?`,
            async () => {
                this.showLoading();
                try {
                    const { error } = await this.supabaseClient.from('debts').insert({
                        creditor: source.creditor,
                        debtor: source.debtor,
                        description: source.description + ' (Cópia)',
                        total_value: source.total_value,
                        installments: source.installments.map(i => ({ ...i, status: 'Pendente', paidAt: null })),
                        creator_id: this.currentUser.id,
                        shared_with: []
                    });

                    if (error) throw error;
                    this.showToast('Dívida clonada!', 'success');
                    await this.loadDebts();
                } catch (err) {
                    this.showToast('Erro ao clonar dívida', 'error');
                } finally {
                    this.hideLoading();
                }
            }
        );
    },

    showTemplatesModal() {
        const templates = [
            { name: "Aluguel", creditor: "Imobiliária", debtor: "Eu", desc: "Pagamento mensal do aluguel", value: 1500, inst: 12 },
            { name: "Cartão de Crédito", creditor: "Banco", debtor: "Eu", desc: "Fatura do cartão", value: 500, inst: 1 },
            { name: "Empréstimo Amigo", creditor: "Amigo", debtor: "Eu", desc: "Acerto de empréstimo", value: 100, inst: 5 },
            { name: "Serviço Prestado", creditor: "Eu", debtor: "Cliente X", desc: "Consultoria mensal", value: 2000, inst: 3 }
        ];

        const list = document.getElementById('templatesList');
        list.innerHTML = templates.map(t => `
            <div onclick="app.applyTemplate(${JSON.stringify(t).replace(/"/g, '&quot;')})" class="p-4 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition-all group">
                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="font-black text-slate-800 uppercase">${t.name}</h4>
                        <p class="text-xs text-slate-500 font-bold">${t.creditor} → ${t.debtor}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm font-black text-indigo-600">R$ ${t.value.toFixed(2)}</p>
                        <p class="text-[10px] text-slate-400 font-bold">${t.inst}x parcelas</p>
                    </div>
                </div>
            </div>
        `).join('');

        this.showModal('templatesModal');
    },

    applyTemplate(tpl) {
        this.hideModal('templatesModal');
        document.getElementById('creditor').value = tpl.creditor;
        document.getElementById('debtor').value = tpl.debtor;
        document.getElementById('description').value = tpl.desc;
        document.getElementById('totalValue').value = tpl.value;
        document.getElementById('installmentsCount').value = tpl.inst;
        
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('firstDueDate').value = now.toISOString().slice(0, 16);
        
        this.showModal('debtModal');
    },

    getCreatorName(creatorId) {
        const user = this.usersList.find(u => u.id === creatorId);
        if (user?.display_name) return user.display_name;
        if (user?.email) return user.email;
        return creatorId;
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

        const isCreator = debt.creator_id === this.currentUser.id;
        let finalStatus = status;
        
        // Se quem está marcando como pago NÃO é o criador, entra em modo de confirmação
        if (status === 'Pago' && !isCreator) {
            finalStatus = 'Aguardando Confirmação';
        }

        const newInsts = debt.installments.map(i => {
            if (i.id === parseInt(instId)) {
                return { 
                    ...i, 
                    status: finalStatus, 
                    paidAt: finalStatus === 'Pago' ? (i.paidAt || new Date().toISOString().slice(0, 16)) : (finalStatus === 'Aguardando Confirmação' ? new Date().toISOString().slice(0, 16) : null)
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
            
            if (finalStatus === 'Aguardando Confirmação') {
                this.showToast('Enviado para confirmação do credor!', 'info');
            }
            
            await this.loadDebts();
        } catch (err) {
            this.showToast('Erro ao atualizar status', 'error');
        } finally {
            this.hideLoading();
        }
    },
    async exportMobilePDF(debtId) {
        const debt = this.debtsLocal.find(d => d.id === debtId);
        if (!debt) return;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Colors
        const primary = [79, 70, 229]; // Indigo-600
        const dark = [30, 41, 59];    // Slate-800
        const light = [148, 163, 184]; // Slate-400
        const green = [16, 185, 129]; // Emerald-500
        
        // Header
        doc.setFillColor(...primary);
        doc.rect(0, 0, 210, 40, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont("helvetica", "bold");
        doc.text("EXTRATO DE DÍVIDA", 20, 20);
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Gerado em: ${new Date().toLocaleString()}`, 20, 30);
        
        // Info Section
        doc.setTextColor(...dark);
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(`${debt.creditor} -> ${debt.debtor}`, 20, 55);
        
        doc.setFontSize(12);
        doc.setTextColor(...light);
        doc.text(debt.description || "Sem descrição", 20, 62);

        // Summary Line
        const totalPaid = debt.installments.filter(i => i.status === 'Pago').reduce((sum, i) => sum + parseFloat(i.value), 0);
        const totalPending = debt.installments.filter(i => i.status !== 'Pago').reduce((sum, i) => sum + parseFloat(i.value), 0);
        
        doc.setFillColor(248, 250, 252); // Slate-50
        doc.rect(20, 70, 170, 20, 'F');
        
        doc.setTextColor(...dark);
        doc.setFontSize(10);
        doc.text("TOTAL PAGO", 30, 78);
        doc.setTextColor(...green);
        doc.setFontSize(14);
        doc.text(`R$ ${totalPaid.toFixed(2)}`, 30, 85);
        
        doc.setTextColor(...dark);
        doc.setFontSize(10);
        doc.text("TOTAL PENDENTE", 120, 78);
        doc.setTextColor(225, 29, 72); // Rose-600
        doc.setFontSize(14);
        doc.text(`R$ ${totalPending.toFixed(2)}`, 120, 85);
        
        // Table Header
        let y = 105;
        doc.setFillColor(...dark);
        doc.rect(20, y, 170, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.text("PARCELA", 25, y+5);
        doc.text("VALOR", 60, y+5);
        doc.text("VENCIMENTO", 100, y+5);
        doc.text("STATUS", 150, y+5);
        
        y += 15;
        debt.installments.forEach((i, idx) => {
            if (y > 270) { doc.addPage(); y = 20; }
            
            doc.setTextColor(...dark);
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(`${idx + 1}/${debt.installments.length}`, 25, y);
            doc.setFont("helvetica", "bold");
            doc.text(`R$ ${parseFloat(i.value).toFixed(2)}`, 60, y);
            doc.setFont("helvetica", "normal");
            doc.text(this.formatDateForDisplay(i.dueDate), 100, y);
            
            if (i.status === 'Pago') {
                doc.setTextColor(...green);
                doc.text("PAGO", 150, y);
            } else if (i.status === 'Aguardando Confirmação') {
                doc.setTextColor(217, 119, 6); // Amber-600
                doc.text("AGUARD. CONF.", 150, y);
            } else {
                doc.setTextColor(225, 29, 72);
                doc.text("PENDENTE", 150, y);
            }
            
            doc.setDrawColor(241, 245, 249);
            doc.line(20, y+2, 190, y+2);
            y += 10;
        });
        
        doc.save(`extrato_${debt.creditor}_${debt.debtor}.pdf`);
        this.showToast('PDF Gerado!', 'success');
    },

    async confirmPayment(debtId, instId) {
        const debt = this.debtsLocal.find(d => d.id === debtId);
        if (!debt) return;

        const newInsts = debt.installments.map(i => {
            if (i.id === parseInt(instId)) {
                return { ...i, status: 'Pago' };
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
            this.showToast('Pagamento confirmado!', 'success');
            await this.loadDebts();
        } catch (err) {
            this.showToast('Erro ao confirmar', 'error');
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
                const displayName = user.display_name || user.email || 'Usuário';
                const btn = document.createElement('button');
                btn.className = 'w-full p-3 bg-slate-100 rounded-lg text-left hover:bg-indigo-50 transition';
                btn.innerHTML = `
                    <div class="font-bold text-slate-700">${this.escapeHtml(displayName)}</div>
                    <div class="text-xs text-slate-400">${user.email || user.id}</div>
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
        const lastId = debt.installments.length > 0 ? Math.max(...debt.installments.map(i => i.id)) : 0;
        const lastInst = debt.installments.length > 0 ? debt.installments[debt.installments.length - 1] : null;
        const defaultValue = lastInst ? lastInst.value : '';

        this.showPrompt(
            'Adicionar Múltiplas Parcelas',
            'Quantas parcelas?',
            '1',
            (countStr) => {
                const count = parseInt(countStr);
                if (!count || count < 1 || count > 60) {
                    this.showToast('Quantidade inválida (1-60)', 'error');
                    return;
                }

                this.showPrompt(
                    'Valor de cada parcela',
                    'Valor de cada parcela',
                    defaultValue,
                    (val) => {
                        if (!val || isNaN(parseFloat(val))) {
                            this.showToast('Valor inválido', 'error');
                            return;
                        }

                        this.datePickerContext = { 
                            debtId, 
                            lastId, 
                            value: val,
                            count: count,
                            mode: 'addMultipleInstallments'
                        };
                        
                        document.getElementById('datePickerDate').value = new Date().toISOString().split('T')[0];
                        document.getElementById('datePickerTime').value = '00:00';
                        document.getElementById('datePickerTitle').textContent = 'Primeiro Vencimento';
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

        // Filtrar por aba e busca
        let debtsToShow = this.debtsLocal;
        if (this.activeTab === 'own') {
            debtsToShow = this.debtsLocal.filter(d => d.creator_id === this.currentUser.id);
        } else if (this.activeTab === 'shared') {
            debtsToShow = this.debtsLocal.filter(d => d.creator_id && d.creator_id !== this.currentUser.id);
        }

        if (this.searchQuery) {
            debtsToShow = debtsToShow.filter(d => 
                d.creditor.toLowerCase().includes(this.searchQuery) || 
                d.debtor.toLowerCase().includes(this.searchQuery) ||
                (d.description && d.description.toLowerCase().includes(this.searchQuery))
            );
        }

        // Atualizar Dashboard Totais
        let sumTotal = 0, sumPaid = 0, sumPending = 0;
        debtsToShow.forEach(d => {
            sumTotal += parseFloat(d.total_value);
            d.installments.forEach(i => {
                const val = parseFloat(i.value);
                if (i.status === 'Pago') sumPaid += val;
                else sumPending += val;
            });
        });

        document.getElementById('sumTotal').innerText = `R$ ${sumTotal.toFixed(2)}`;
        document.getElementById('sumPaid').innerText = `R$ ${sumPaid.toFixed(2)}`;
        document.getElementById('sumPending').innerText = `R$ ${sumPending.toFixed(2)}`;
        document.getElementById('debtCount').innerText = debtsToShow.length;

        if (debtsToShow.length === 0) {
            main.innerHTML = `<div class="col-span-full text-center py-20 text-slate-400">
                <p class="font-black text-2xl uppercase tracking-widest">${this.activeTab === 'own' ? 'Sem resultados' : 'Sem dívidas compartilhadas'}</p>
                <p class="text-sm font-bold mt-2 opacity-50">Tente outro termo de busca ou mude a aba! ✨</p>
            </div>`;
            return;
        }

        debtsToShow.forEach(d => {
            const safeDebt = this.sanitizeDebt(d);
            const isExp = this.expandedIds.has(d.id);
            const canEdit = d.creator_id && d.creator_id === this.currentUser.id;
            const isSharedWithMe = !canEdit && d.creator_id; // dividas compartilhadas COMIGO
            const iSharedWithOthers = canEdit && d.shared_with && d.shared_with.length > 0; // dividas que eu compartilhei
            const creatorName = isSharedWithMe ? this.getCreatorName(d.creator_id) : null;
            const paidVal = d.installments
                .filter(i => i.status === 'Pago')
                .reduce((acc, i) => acc + parseFloat(i.value), 0);
            const totalVal = parseFloat(d.total_value);

            let cardClass = 'bg-white rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden flex flex-col h-fit transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-100 ';
            if (iSharedWithOthers) {
                cardClass += 'border-2 border-green-400';
            } else if (isSharedWithMe) {
                cardClass += 'border-2 border-blue-400';
            } else {
                cardClass += 'border border-slate-100';
            }

            const card = document.createElement('div');
            card.className = cardClass;
            card.innerHTML = `
                <div class="p-4 cursor-pointer" onclick="app.toggleExpand('${d.id}')">
                    ${iSharedWithOthers ? '<div class="bg-green-50 text-green-600 text-[10px] font-bold uppercase py-1 px-2 rounded mb-2">Enviada para</div>' : ''}
                    ${isSharedWithMe ? `<div class="bg-blue-50 text-blue-600 text-[10px] font-bold uppercase py-1 px-2 rounded mb-2">De: ${creatorName}</div>` : ''}
                    <div class="flex justify-between items-start ${this.globalCompactMode && !isExp ? 'mb-0' : 'mb-2'}">
                        <div class="flex-1 min-w-0 pr-2">
                            <h3 class="${this.globalCompactMode && !isExp ? 'text-lg' : 'text-2xl'} font-black text-slate-800 uppercase leading-tight truncate">${safeDebt.creditor}</h3>
                            <p class="${this.globalCompactMode && !isExp ? 'text-xs truncate' : 'text-base uppercase tracking-widest'} font-black text-slate-400">${safeDebt.debtor}</p>
                        </div>
                        <div class="text-right">
                             <div class="flex flex-col items-end">
                                <p class="${this.globalCompactMode && !isExp ? 'text-base' : 'text-lg italic'} font-black text-indigo-600 whitespace-nowrap">R$ ${totalVal.toFixed(2)}</p>
                                ${d.installments.some(i => i.status === 'Aguardando Confirmação') ? '<span class="text-[9px] bg-amber-500 text-white px-1 rounded font-black animate-pulse mt-0.5">PENDENTE DE CONFIRMAÇÃO</span>' : ''}
                             </div>
                             ${(this.globalCompactMode && !isExp && canEdit) ? `
                                <div class="flex gap-2 mt-1 justify-end opacity-40 hover:opacity-100 transition-opacity">
                                    <button onclick="event.stopPropagation(); app.cloneDebt('${d.id}')" title="Clonar" class="p-1 hover:text-indigo-600">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                    </button>
                                    <button onclick="event.stopPropagation(); app.exportMobilePDF('${d.id}')" title="PDF" class="p-1 hover:text-amber-600">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                                    </button>
                                    <button onclick="event.stopPropagation(); app.deleteDebt('${d.id}')" title="Excluir" class="p-1 hover:text-rose-600">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                    </button>
                                    <button onclick="event.stopPropagation(); app.toggleExpand('${d.id}')" title="Detalhes" class="p-1 hover:text-indigo-600">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    </button>
                                </div>
                             ` : ''}
                        </div>
                    </div>
                    
                    ${(!this.globalCompactMode || isExp) ? `
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
                    ` : ''}
                </div>

                <div class="${isExp ? 'block' : 'hidden'} bg-slate-50 border-t border-slate-200 p-5 space-y-4">
                    ${canEdit ? `
                    <div class="grid grid-cols-4 gap-2">
                        <button onclick="app.exportMobilePDF('${d.id}')" title="Exportar PDF" class="py-3 bg-amber-400 text-black rounded-lg font-black text-xs uppercase">PDF</button>
                        <button onclick="app.cloneDebt('${d.id}')" title="Clonar Dívida" class="py-3 bg-teal-500 text-white rounded-lg font-black text-xs uppercase">Clone</button>
                        <button onclick="app.addInstallment('${d.id}')" title="Adicionar 1 Parcela" class="py-3 bg-indigo-600 text-white rounded-lg font-black text-xs uppercase">+1</button>
                        <button onclick="app.addMultipleInstallments('${d.id}')" title="Múltiplas Parcelas" class="py-3 bg-indigo-600 text-white rounded-lg font-black text-xs uppercase">+Multi</button>
                    </div>
                    <div class="grid grid-cols-1 gap-2">
                        <button onclick="app.shareDebt('${d.id}')" class="py-3 bg-white border border-slate-300 text-slate-600 rounded-xl font-black text-[10px] uppercase flex items-center justify-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                            ${(d.shared_with || []).length > 0 ? `Compartilhado (${d.shared_with.length})` : 'Compartilhar'}
                        </button>
                    </div>

                    <div class="flex gap-2 flex-wrap">
                        <button onclick="app.selectPendingInDebt('${d.id}')" class="py-2 px-3 bg-amber-100 text-amber-700 rounded-lg font-black text-xs uppercase">Pendentes</button>
                        <button onclick="app.selectAllInDebt('${d.id}')" class="py-2 px-3 bg-blue-100 text-blue-700 rounded-lg font-black text-xs uppercase">Todas</button>
                        <button onclick="app.clearSelectionInDebt('${d.id}')" class="py-2 px-3 bg-slate-100 text-slate-500 rounded-lg font-black text-xs uppercase">Limpar</button>
                        ${this.selectedInstallments.size > 0 ? `
                            <button onclick="app.markSelectedAsPaid('${d.id}')" class="py-2 px-3 bg-emerald-500 text-white rounded-lg font-black text-xs uppercase">Pagar (${this.selectedInstallments.size})</button>
                            <button onclick="app.markSelectedAsPending('${d.id}')" class="py-2 px-3 bg-rose-500 text-white rounded-lg font-black text-xs uppercase">Pendente (${this.selectedInstallments.size})</button>
                        ` : ''}
                    </div>

                    <button onclick="app.toggleCompactMode('${d.id}')" class="w-full py-2 bg-slate-200 text-slate-600 rounded-lg font-bold text-xs uppercase">
                        ${this.compactMode.has(d.id) ? 'Modo Normal' : 'Modo Compacto'}
                    </button>

                    ${(() => {
                        const isCompact = this.compactMode.has(d.id);
                        if (isCompact) {
                            return `<div class="grid grid-cols-6 gap-0.5 text-xs">` + 
                                d.installments.map(i => `
                                    <div onclick="app.toggleCompactInstallment('${d.id}', ${i.id})" class="p-2 rounded cursor-pointer ${i.status === 'Pago' ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-500' : (i.status === 'Aguardando Confirmação' ? 'bg-amber-100 text-amber-700 border-2 border-amber-500 animate-pulse' : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:border-indigo-300')} flex flex-col items-center">
                                        <div class="font-bold text-xs">R$ ${parseFloat(i.value).toFixed(0)}</div>
                                        <div class="text-[9px]">${i.dueDate ? i.dueDate.split('T')[0].slice(5) : ''}</div>
                                        <div class="mt-1">
                                            ${i.status === 'Pago' 
                                                ? '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-600"><polyline points="20 6 9 17 4 12"/></svg>' 
                                                : (i.status === 'Aguardando Confirmação' 
                                                    ? '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-amber-600"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
                                                    : '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400"><circle cx="12" cy="12" r="10"/></svg>')}
                                        </div>
                                    </div>
                                `).join('') + 
                                `</div>`;
                        }
                        return `<div class="space-y-1">
                        ${d.installments.map(i => {
                            const isSelected = this.selectedInstallments.has(`${d.id}_${i.id}`);
                            return `
                            <div class="relative rounded-lg overflow-hidden">
                                <div class="swipe-bg-right uppercase">Pago</div>
                                <div class="swipe-bg-left uppercase">Pendente</div>
                                <div class="inst-card p-2 flex items-center justify-between border ${isSelected ? 'border-indigo-500 bg-indigo-50 shadow-inner' : (i.status === 'Aguardando Confirmação' ? 'border-amber-300 bg-amber-50' : 'border-slate-200')}" 
                                     ontouchstart="app.tS(event)" 
                                     ontouchmove="app.tM(event)" 
                                     ontouchend="app.tE(event, '${d.id}', ${i.id})"
                                     onmousedown="app.tS(event)"
                                     onmousemove="app.tM(event)"
                                     onmouseup="app.tE(event, '${d.id}', ${i.id})"
                                     onclick="app.toggleInstallmentSelection('${d.id}', ${i.id}, event)">
                                    <div class="flex items-center gap-3">
                                        <div class="w-2 h-10 rounded-full ${i.status === 'Pago' ? 'bg-emerald-400' : (i.status === 'Aguardando Confirmação' ? 'bg-amber-400' : 'bg-slate-200')}"></div>
                                        <div>
                                            <p class="text-lg font-black ${i.status === 'Pago' ? 'text-emerald-600' : (i.status === 'Aguardando Confirmação' ? 'text-amber-600' : 'text-slate-800')}">R$ ${i.value}</p>
                                            <div class="flex gap-4 mt-1">
                                                <p class="text-[10px] font-bold text-slate-400" onclick="event.stopPropagation(); app.editDate('${d.id}', ${i.id}, 'dueDate')">Venc: <span class="underline">${app.formatDateForDisplay(i.dueDate)}</span></p>
                                                ${(i.paidAt || i.status === 'Aguardando Confirmação') ? `<p class="text-[10px] font-bold text-emerald-400">Enviado: <span class="underline">${app.formatDateTimeForDisplay(i.paidAt)}</span></p>` : ''}
                                            </div>
                                            ${i.status === 'Aguardando Confirmação' ? `<div class="text-[10px] font-black text-amber-500 uppercase mt-1 flex items-center gap-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                                Aguardando credor confirmar
                                            </div>` : (i.note ? `<div class="text-[10px] font-bold text-slate-500 mt-1 flex items-center gap-1" onclick="event.stopPropagation(); app.editInstallmentNote('${d.id}', ${i.id})">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                                ${i.note}
                                            </div>` : '')}
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        ${(i.status === 'Aguardando Confirmação' && canEdit) ? `<button onclick="event.stopPropagation(); app.confirmPayment('${d.id}', ${i.id})" class="bg-emerald-500 text-white px-3 py-1 rounded text-[10px] font-black hover:bg-emerald-600 transition">CONFIRMAR</button>` : ''}
                                        <button onclick="event.stopPropagation(); app.editInstallmentValue('${d.id}', ${i.id})" title="Editar Valor" class="text-slate-300 p-2 hover:text-indigo-500">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                        </button>
                                        <button onclick="event.stopPropagation(); app.removeInstallment('${d.id}', ${i.id})" title="Remover Parcela" class="text-rose-200 p-2 hover:text-rose-500">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;}).join('')}
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
        
        const newStatus = (inst.status === 'Pago' || inst.status === 'Aguardando Confirmação') ? 'Pendente' : 'Pago';
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

        const isCreator = debt.creator_id === this.currentUser.id;
        let finalStatus = 'Pago';
        let isWaiting = false;

        if (!isCreator) {
            finalStatus = 'Aguardando Confirmação';
            isWaiting = true;
        }

        const newInsts = debt.installments.map(i => {
            const key = `${debtId}_${i.id}`;
            if (this.selectedInstallments.has(key) && i.status !== 'Pago') {
                return { 
                    ...i, 
                    status: finalStatus, 
                    paidAt: (i.status === 'Aguardando Confirmação' || i.status === 'Pago') ? i.paidAt : new Date().toISOString().slice(0, 16)
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
                this.showToast(isWaiting ? 'Enviado para confirmação do credor!' : 'Parcelas marcadas como pago!', 'success');
                await this.loadDebts();
            } catch (err) {
                this.showToast('Erro ao atualizar parcelas', 'error');
            } finally {
                this.hideLoading();
            }
        })();
    },

    markSelectedAsPending(debtId) {
        if (this.selectedInstallments.size === 0) return;

        const debt = this.debtsLocal.find(d => d.id === debtId);
        if (!debt) return;

        const newInsts = debt.installments.map(i => {
            const key = `${debtId}_${i.id}`;
            if (this.selectedInstallments.has(key) && i.status !== 'Pendente') {
                return { 
                    ...i, 
                    status: 'Pendente', 
                    paidAt: null
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
                this.showToast('Parcelas marcadas como pendente!', 'success');
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
