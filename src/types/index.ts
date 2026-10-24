export type AppMode = 'fast_formula' | 'hdl' | 'dbi_reference';

export type FormulaType =
  | 'Oracle Payroll'
  | 'Compensation Person Selection'
  | 'Global Absence Accrual'
  | 'Element Input Validation'
  | 'Element Skip'
  | 'HCM Extract Rule'
  | 'Proration Event'
  | 'User Defined Table';

export type HDLObjectType =
  | 'Worker'
  | 'WorkTerms'
  | 'Assignment'
  | 'Salary'
  | 'ElementEntry'
  | 'Job'
  | 'Position'
  | 'Department'
  | 'AbsenceEntry'
  | 'PersonNationalIdentifier';

export interface FastFormulaContext {
  formulaName: string;
  formulaType: FormulaType;
  effectiveDate: string;
  legislativeDataGroup: string;
  enableLogging: boolean;
  loggingMethod: 'ESS_LOG_WRITE' | 'SET_LOG' | 'FND_LOG';
  author: string;
  returnVariables: string;
}

export interface HDLContext {
  objectType: HDLObjectType;
  action: 'MERGE' | 'DELETE';
  keyType: 'SourceSystemId' | 'UserKey';
  sourceSystemOwner: string;
  purgeFutureChanges: boolean;
  effectiveStartDate: string;
  effectiveEndDate: string;
  outputFormat: 'dat' | 'csv_hsdl';
}

export interface ValidationIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  line?: number;
  message: string;
  detail?: string;
  suggestion?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errorCount: number;
  warningCount: number;
  issues: ValidationIssue[];
  metrics?: {
    totalLines: number;
    metadataCount?: number;
    mergeCount?: number;
    dbiCount?: number;
    returnVarCount?: number;
  };
}

export interface HistoryItem {
  id: string;
  title: string;
  mode: AppMode;
  timestamp: number;
  prompt: string;
  code: string;
  context: FastFormulaContext | HDLContext;
  isFavorite: boolean;
  validationIssuesCount: number;
}

export interface QuickTemplate {
  id: string;
  mode: AppMode;
  title: string;
  subtitle: string;
  category: string;
  prompt: string;
  context: Partial<FastFormulaContext & HDLContext>;
  defaultCode: string;
  checklist: string[];
}

export interface DBIRefItem {
  name: string;
  dataType: 'NUMBER' | 'TEXT' | 'DATE';
  module: 'Core HR' | 'Payroll' | 'Absence' | 'Compensation' | 'Extracts';
  description: string;
  contextRequired: string;
  sampleDefault: string;
}

export interface HDLObjectRefItem {
  objectName: HDLObjectType;
  fileName: string;
  module: string;
  description: string;
  loadSequence: number;
  prerequisites: string[];
  keyAttributes: string[];
  commonAttributes: string[];
  sampleRecord: string;
}
