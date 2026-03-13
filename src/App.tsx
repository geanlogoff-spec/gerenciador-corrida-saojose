import React, { useState, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import { Upload, Search, CheckCircle, Circle, Filter, Download, Trash2, User, Shirt, Hash, Lock, LogIn, LogOut } from 'lucide-react';
import { cn } from './lib/utils';
import { supabase } from './lib/supabase';

interface Participant {
  id: string;
  name: string;
  document: string;
  shirtSize: string;
  chestNumber: string;
  status: 'pending' | 'delivered';
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sizeFilter, setSizeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'pending' | 'delivered'>('ALL');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      if (session) fetchParticipants();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
      if (session) {
        fetchParticipants();
      } else {
        setParticipants([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const channel = supabase
      .channel('participants_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, () => {
        fetchParticipants();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated]);

  const fetchParticipants = async () => {
    const { data, error } = await supabase.from('participants').select('*').order('chest_number', { ascending: true });
    if (data) {
      setParticipants(
        data.map((p: any) => ({
          id: p.id,
          name: p.name,
          document: p.document,
          shirtSize: p.shirt_size,
          chestNumber: p.chest_number,
          status: p.status,
        }))
      );
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // We use a fixed admin email so the user only needs the password, keeping the UX simple.
    const { error } = await supabase.auth.signInWithPassword({
      email: 'admin@saojose.com',
      password: password,
    });

    if (error) {
      setError('Senha incorreta. Tente novamente.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setPassword('');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const data = results.data as any[];

        const mappedData = data.map((row, index) => {
          const getField = (keys: string[]) => {
            const key = Object.keys(row).find(k => keys.some(searchKey => k.toLowerCase().includes(searchKey)));
            return key ? row[key] : '';
          };

          const name = getField(['nome', 'name', 'atleta', 'participante']) || `Atleta ${index + 1}`;
          const document = getField(['doc', 'cpf', 'rg', 'identidade']) || '-';
          const shirtSize = getField(['tamanho', 'size', 'camisa']) || 'M';

          const chestNumber = String(index + 1).padStart(4, '0');

          return {
            name,
            document,
            shirt_size: shirtSize.toUpperCase(),
            chest_number: chestNumber,
            status: 'pending'
          };
        });

        const { error } = await supabase.from('participants').insert(mappedData);
        if (error) {
          console.error(error);
          alert('Erro ao salvar no Supabase.');
        }
      },
      error: (error) => {
        console.error('Error parsing file:', error);
        alert('Erro ao ler o arquivo. Verifique se é um CSV ou TSV válido.');
      }
    });
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'pending' ? 'delivered' : 'pending';
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p));

    const { error } = await supabase.from('participants').update({ status: newStatus }).eq('id', id);
    if (error) {
      alert('Erro ao atualizar status.');
      fetchParticipants();
    }
  };

  const clearData = () => {
    setShowClearConfirm(true);
  };

  const confirmClearData = async () => {
    setShowClearConfirm(false);
    // Delete all records by providing a condition that's always true for existing records
    const { error } = await supabase.from('participants').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      console.error(error);
      alert('Erro ao limpar os dados do banco.');
    }
  };

  const exportData = () => {
    const csv = Papa.unparse(participants);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'entrega_kits_sao_jose.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredParticipants = useMemo(() => {
    return participants.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.chestNumber.includes(searchTerm) ||
        p.document.includes(searchTerm);
      const matchesSize = sizeFilter === 'ALL' || p.shirtSize === sizeFilter;
      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;

      return matchesSearch && matchesSize && matchesStatus;
    });
  }, [participants, searchTerm, sizeFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = participants.length;
    const delivered = participants.filter(p => p.status === 'delivered').length;
    const pending = total - delivered;

    const sizes = participants.reduce((acc, p) => {
      acc[p.shirtSize] = (acc[p.shirtSize] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { total, delivered, pending, sizes };
  }, [participants]);

  const uniqueSizes = useMemo(() => {
    return Array.from(new Set(participants.map(p => p.shirtSize))).sort();
  }, [participants]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden bg-dark">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-neon/20 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/20 blur-[120px] rounded-full pointer-events-none" />

        <div className="z-10 w-full max-w-md bg-white/5 border border-white/10 p-8 rounded-3xl backdrop-blur-md shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-neon/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-neon" />
            </div>
            <h1 className="text-3xl font-black tracking-tighter text-white uppercase italic text-center leading-none">
              Acesso ao <br /><span className="text-neon">Gerenciador</span>
            </h1>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="block text-gray-400 text-sm font-bold mb-2 uppercase tracking-wider">Senha de Acesso</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-neon focus:ring-1 focus:ring-neon transition-all"
                placeholder="Digite a senha..."
              />
            </div>
            {error && <p className="text-red-400 text-sm font-semibold text-center">{error}</p>}
            <button
              type="submit"
              className="w-full bg-neon text-dark font-black uppercase tracking-wider py-3 rounded-xl hover:bg-neon/90 transition-colors flex items-center justify-center gap-2 mt-2"
            >
              <LogIn className="w-5 h-5" />
              Entrar no Sistema
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (participants.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <button
          onClick={handleLogout}
          className="absolute top-4 right-4 md:top-8 md:right-8 flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors z-50"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
        {/* Background Effects */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-neon/20 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/20 blur-[120px] rounded-full pointer-events-none" />

        <div className="z-10 text-center max-w-xl w-full">
          <div className="mb-8 flex flex-col items-center">
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter mb-2 text-white uppercase italic text-center">
              IV Corrida de <br />
              <span className="text-neon text-5xl md:text-6xl">São José</span>
            </h1>
            <p className="text-gray-400 text-base md:text-lg uppercase tracking-widest font-semibold mt-4 text-center">
              Gerenciador de Kits
            </p>
          </div>

          <label className="group relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-neon/50 rounded-3xl bg-dark/50 hover:bg-neon/5 transition-all cursor-pointer overflow-hidden backdrop-blur-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-neon/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex flex-col items-center justify-center pt-5 pb-6 relative z-10">
              <div className="w-16 h-16 mb-4 rounded-full bg-neon/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8 text-neon" />
              </div>
              <p className="mb-2 text-xl font-bold text-white">Clique para fazer upload</p>
              <p className="text-sm text-gray-400">ou arraste seu arquivo CSV / TSV</p>
              <div className="mt-4 text-xs text-gray-500 bg-black/40 px-4 py-2 rounded-full">
                Colunas esperadas: Nome, Documento, Tamanho
              </div>
            </div>
            <input
              type="file"
              className="hidden"
              accept=".csv,.tsv"
              onChange={handleFileUpload}
            />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark p-4 md:p-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
        <div className="w-full text-center md:text-left">
          <h1 className="text-3xl font-black tracking-tighter text-white uppercase italic leading-none">
            IV Corrida de <span className="text-neon">São José</span>
          </h1>
          <p className="text-gray-400 text-sm uppercase tracking-widest font-semibold mt-1">
            Entrega do Kit
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          <button
            onClick={exportData}
            className="flex justify-center items-center gap-2 px-4 py-3 md:py-2 rounded-xl md:rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors w-full sm:w-auto"
          >
            <Download className="w-4 h-4" />
            Exportar
          </button>
          <button
            onClick={clearData}
            className="flex justify-center items-center gap-2 px-4 py-3 md:py-2 rounded-xl md:rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-semibold transition-colors w-full sm:w-auto"
          >
            <Trash2 className="w-4 h-4" />
            Limpar
          </button>
          <button
            onClick={handleLogout}
            className="flex justify-center items-center gap-2 px-4 py-3 md:py-2 rounded-xl md:rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors w-full sm:w-auto"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm flex items-center justify-between sm:block">
          <p className="text-gray-400 text-xs uppercase tracking-wider font-bold mb-1">Total Inscritos</p>
          <p className="text-3xl font-black text-white">{stats.total}</p>
        </div>
        <div className="bg-neon/10 border border-neon/20 rounded-2xl p-4 backdrop-blur-sm flex items-center justify-between sm:block">
          <p className="text-neon/80 text-xs uppercase tracking-wider font-bold mb-1">Kits Entregues</p>
          <p className="text-3xl font-black text-neon">{stats.delivered}</p>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 backdrop-blur-sm flex items-center justify-between sm:block">
          <p className="text-orange-400/80 text-xs uppercase tracking-wider font-bold mb-1">Pendentes</p>
          <p className="text-3xl font-black text-orange-400">{stats.pending}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm flex flex-col justify-center">
          <p className="text-gray-400 text-xs uppercase tracking-wider font-bold mb-2">Tamanhos</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.sizes).map(([size, count]) => (
              <div key={size} className="flex items-center gap-1 text-xs bg-black/40 px-2 py-1 rounded-md">
                <span className="font-bold text-white">{size}:</span>
                <span className="text-gray-400">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 mb-6 bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, peito ou documento..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:border-neon focus:ring-1 focus:ring-neon transition-all"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-2 overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
          <div className="flex items-center gap-2 bg-black/40 rounded-xl p-1 border border-white/10 shrink-0">
            <Filter className="w-4 h-4 text-gray-400 ml-2" />
            <select
              value={sizeFilter}
              onChange={(e) => setSizeFilter(e.target.value)}
              className="bg-transparent text-white text-sm font-semibold py-2 pr-8 pl-2 focus:outline-none appearance-none cursor-pointer w-full"
            >
              <option value="ALL" className="bg-dark">Todos Tamanhos</option>
              {uniqueSizes.map(size => (
                <option key={size} value={size} className="bg-dark">Tamanho {size}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center bg-black/40 rounded-xl p-1 border border-white/10 shrink-0 w-full sm:w-auto justify-between">
            {(['ALL', 'pending', 'delivered'] as const).map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  "flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all capitalize text-center",
                  statusFilter === status
                    ? "bg-white/10 text-white"
                    : "text-gray-500 hover:text-gray-300"
                )}
              >
                {status === 'ALL' ? 'Todos' : status === 'pending' ? 'Pendentes' : 'Entregues'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List - Desktop */}
      <div className="hidden md:block bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-gray-400 bg-black/20">
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Nº Peito</th>
                <th className="p-4 font-semibold">Atleta</th>
                <th className="p-4 font-semibold">Documento</th>
                <th className="p-4 font-semibold">Camisa</th>
                <th className="p-4 font-semibold text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filteredParticipants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    Nenhum participante encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filteredParticipants.map((p) => (
                  <tr
                    key={p.id}
                    className={cn(
                      "border-b border-white/5 hover:bg-white/5 transition-colors group",
                      p.status === 'delivered' ? "bg-neon/5" : ""
                    )}
                  >
                    <td className="p-4">
                      {p.status === 'delivered' ? (
                        <div className="flex items-center gap-2 text-neon text-xs font-bold uppercase tracking-wider">
                          <CheckCircle className="w-4 h-4" /> Entregue
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-orange-400 text-xs font-bold uppercase tracking-wider">
                          <Circle className="w-4 h-4" /> Pendente
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Hash className="w-4 h-4 text-gray-500" />
                        <span className="font-mono text-xl font-black text-white">{p.chestNumber}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                          <User className="w-4 h-4 text-gray-300" />
                        </div>
                        <span className="font-bold text-white">{p.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-gray-400 font-mono text-sm">
                      {p.document}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Shirt className="w-4 h-4 text-gray-500" />
                        <span className="bg-white/10 px-2 py-1 rounded text-sm font-bold text-white">
                          {p.shirtSize}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => toggleStatus(p.id, p.status)}
                        className={cn(
                          "px-4 py-2 rounded-full text-sm font-bold transition-all shadow-lg active:scale-95",
                          p.status === 'pending'
                            ? "bg-neon text-dark hover:bg-neon/90 hover:shadow-neon/20"
                            : "bg-white/10 text-white hover:bg-white/20"
                        )}
                      >
                        {p.status === 'pending' ? 'Entregar Kit' : 'Desfazer'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* List - Mobile Cards */}
      <div className="md:hidden flex flex-col gap-4">
        {filteredParticipants.length === 0 ? (
          <div className="p-8 text-center text-gray-500 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm">
            Nenhum participante encontrado com os filtros atuais.
          </div>
        ) : (
          filteredParticipants.map((p) => (
            <div
              key={p.id}
              className={cn(
                "bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-4 backdrop-blur-sm transition-colors",
                p.status === 'delivered' ? "bg-neon/5 border-neon/20" : ""
              )}
            >
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-gray-500" />
                  <span className="font-mono text-2xl font-black text-white">{p.chestNumber}</span>
                </div>
                {p.status === 'delivered' ? (
                  <div className="flex items-center gap-1 text-neon text-xs font-bold uppercase tracking-wider bg-neon/10 px-2 py-1 rounded-md">
                    <CheckCircle className="w-3 h-3" /> Entregue
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-orange-400 text-xs font-bold uppercase tracking-wider bg-orange-400/10 px-2 py-1 rounded-md">
                    <Circle className="w-3 h-3" /> Pendente
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-gray-300" />
                  </div>
                  <span className="font-bold text-white text-lg leading-tight">{p.name}</span>
                </div>
                <div className="text-gray-400 font-mono text-sm pl-11">
                  Doc: {p.document}
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <div className="flex items-center gap-2">
                  <Shirt className="w-4 h-4 text-gray-500" />
                  <span className="bg-white/10 px-3 py-1 rounded-lg text-sm font-bold text-white">
                    {p.shirtSize}
                  </span>
                </div>
                <button
                  onClick={() => toggleStatus(p.id, p.status)}
                  className={cn(
                    "px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg active:scale-95",
                    p.status === 'pending'
                      ? "bg-neon text-dark hover:bg-neon/90 hover:shadow-neon/20"
                      : "bg-white/10 text-white hover:bg-white/20"
                  )}
                >
                  {p.status === 'pending' ? 'Entregar Kit' : 'Desfazer'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-dark border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">Limpar todos os dados?</h3>
            <p className="text-gray-400 mb-6">
              Esta ação removerá todos os participantes e não poderá ser desfeita. Tem certeza que deseja continuar?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-white/10 hover:bg-white/20 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmClearData}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors"
              >
                Sim, limpar dados
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
