export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  totalPages: number
}

export interface DashboardStats {
  colaboradores: number
  maquinas: number
  notebooks: number
  aparelhos: number
  impressoras: number
  ramais: number
  racks: number
  solicitacoesAbertas: number
}

export interface AlocacaoAtiva {
  id: string
  colaborador: {
    id?: string
    nome: string
    setor_rel?: {
      nome: string | null
    } | null
  }
  data_inicio: string | null
  whatsapp?: boolean | null  // apenas para ramais
}

export interface Colaborador {
  id: string
  codigo: number
  nome: string
  status: 'Ativo' | 'Inativo'
  setor_id?:   string | null
  setor_nome?: string | null
  localidade_id?: string | null
  localidade_nome?: string | null
  created_at: string | null
  alocacoes_maquinas_ativas?: number
  alocacoes_notebooks_ativas?: number
  alocacoes_aparelhos_ativas?: number
  alocacoes_ramais_ativas?: number
}

export interface Maquina {
  id: string
  /** Campo padrão de última revisão (checklist). */
  checklist_revisado_em?: string | null
  checklist_ultima_id?: string | null
  nome_host: string | null
  identificador: string | null
  fabricante: string | null
  modelo: string | null
  categoria: 'Administrativa' | 'Academica' | 'Backup' | null
  tipo: string | null
  processador: string | null
  memoria_ram: string | null
  armazenamento: string | null
  endereco_ip: string | null
  setor_id?:   string | null
  setor_nome?: string | null
  localidade_id?: string | null
  localidade_nome?: string | null
  patrimonio_cpu: string | null
  patrimonio_monitor: string | null
  data_revisao: string | null
  created_at: string | null

  alocacao_ativa?: AlocacaoAtiva | null
  alocacoes_ativas?: AlocacaoAtiva[]  
}

export interface Notebook {
  id: string
  /** Campo padrão de última revisão (checklist). */
  checklist_revisado_em?: string | null
  checklist_ultima_id?: string | null
  modelo: string | null
  fabricante: string | null
  categoria: 'Administrativa' | 'Academica' | null
  processador: string | null
  memoria: string | null
  armazenamento: string | null
  numero_patrimonio: string | null
  data_revisao: string | null
  created_at: string | null
  setor_id: string | null
  setor_nome?: string | null
  localidade_id?: string | null
  localidade_nome?: string | null
  emprestado: boolean
  emprestado_colaborador_id: string | null
  emprestado_colaborador_nome?: string | null
  emprestado_colaborador_setor?: string | null
  emprestado_setor_id: string | null
  emprestado_obs: string | null
  emprestado_desde: string | null

  alocacao_ativa?: AlocacaoAtiva | null
  alocacoes_ativas?: AlocacaoAtiva[]  
}

export interface Aparelho {
  id: string
  /** Campo padrão de última revisão (checklist). */
  checklist_revisado_em?: string | null
  checklist_ultima_id?: string | null
  modelo: string | null
  tipo: number | null
  chip: boolean | null
  endereco_ip: string | null
  endereco_mac: string | null
  setor_id?:   string | null
  setor_nome?: string | null
  localidade_id?: string | null
  localidade_nome?: string | null
  status: boolean | null
  created_at: string | null

  alocacao_ativa?: AlocacaoAtiva | null
  alocacoes_ativas?: AlocacaoAtiva[]  
}

export interface Impressora {
  id: string
  /** Campo padrão de última revisão (checklist). */
  checklist_revisado_em?: string | null
  checklist_ultima_id?: string | null
  nome_host: string | null
  fabricante: string | null
  modelo: string | null
  numero_serie: string | null
  endereco_ip: string | null
  andar: string | null
  localidade: string | null
  setor_id?:   string | null
  setor_nome?: string | null
  localidade_id?: string | null
  localidade_nome?: string | null
  servidor_impressao: string | null
  identificador_selb: string | null
  tipo_usuario: string | null
  revisao: string | null
  status: boolean | null
  created_at: string | null
}

export interface Ramal {
  id: string
  /** Campo padrão de última revisão (checklist). */
  checklist_revisado_em?: string | null
  checklist_ultima_id?: string | null
  numero_ramal: string | null
  setor_id?:   string | null
  setor_nome?: string | null
  localidade_id?: string | null
  localidade_nome?: string | null
  prefixo_telefonico: string | null
  disponibilidade: string | null
  fila: boolean | null
  contemplacao: boolean | null
  status_contemplacao: number | null
  senha_acesso: string | null
  created_at: string | null

  alocacao_ativa?: AlocacaoAtiva | null
  alocacoes_ativas?: AlocacaoAtiva[]  
  ultima_revisao?: string | null
}


export interface Rack {
  id: string
  /** Campo padrão de última revisão (checklist). */
  checklist_revisado_em?: string | null
  checklist_ultima_id?: string | null
  nome_switch: string | null
  marca_switch: string | null
  localizacao: string | null
  numero_patrimonio: string | null
  quantidade_portas: number | null
  portas_em_uso: number | null
  portas_livres: number | null
  portas_academicas: string | null
  portas_vlan_impressoras: string | null
  created_at: string | null
  setor_id?:   string | null
  setor_nome?: string | null
  localidade_id?: string | null
  localidade_nome?: string | null
}

export interface Movimentacao {
  id: string
  data_movimentacao: string | null
  identificador_dispositivo: string | null
  tipo_dispositivo: number | null
  tipo_movimentacao: number | null
  colaborador_id: string | null
  setor: string | null
  tecnico_responsavel: string | null
  observacao: string | null
  created_at: string | null
  colaborador?: { nome: string } | null
}

export interface Solicitacao {
  id: string
  data_criacao: string | null
  colaborador_relacionado: string | null
  identificador_dispositivo: string | null
  tipo_dispositivo: number | null
  tipo_solicitacao: number | null
  status_solicitacao: number | null
  prioridade: number | null
  origem_solicitacao: number | null
  solicitante: string | null
  observacao: string | null
  created_at: string | null
}
