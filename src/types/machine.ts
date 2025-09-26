export interface Machine {
  id: string;
  modelo: string;
  placa?: string;
  tag: string;
  setor: string;
  combustivel?: string;
  checklists: string[];
}
