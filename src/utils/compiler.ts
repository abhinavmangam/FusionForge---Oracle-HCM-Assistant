import { FastFormulaContext, HDLContext, ValidationIssue, ValidationResult } from '../types';

/**
 * Validates Oracle Fast Formula syntax and best practices
 */
export function validateFastFormula(code: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const lines = code.split('\n');

  let hasHeaderComment = false;
  let hasReturnStatement = false;
  let openIfCount = 0;
  let closeIfCount = 0;
  let openParenCount = 0;
  let closeParenCount = 0;

  const declaredDefaults = new Set<string>();
  const referencedDbis = new Set<string>();

  // Regex patterns
  const defaultRegex = /^\s*DEFAULT\s+FOR\s+([A-Za-z0-9_]+)\s+IS/i;
  const returnRegex = /^\s*RETURN\s+/i;
  const ifRegex = /\bIF\b(?!\s*THEN)/gi;
  const endifRegex = /\bENDIF\b/gi;
  const dbiPattern = /\b([A-Z]{2,4}_[A-Z0-9_]{3,})\b/g;

  // Check for header comment
  if (code.includes('/*') && code.includes('*/') && code.includes('FORMULA NAME')) {
    hasHeaderComment = true;
  } else {
    issues.push({
      id: 'hdr-missing',
      type: 'warning',
      line: 1,
      message: 'Recommended header comment block missing or incomplete.',
      suggestion: 'Add standard Oracle Fast Formula banner comments including FORMULA NAME, TYPE, and HISTORY.',
    });
  }

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1;
    const cleanLine = lineText.replace(/\/\*.*?\*\//g, '').trim();

    // Check DEFAULT FOR declarations
    const defaultMatch = cleanLine.match(defaultRegex);
    if (defaultMatch) {
      declaredDefaults.add(defaultMatch[1].toUpperCase());
    }

    // Check RETURN statement
    if (returnRegex.test(cleanLine)) {
      hasReturnStatement = true;
    }

    // Count IF and ENDIF
    const ifs = cleanLine.match(ifRegex);
    if (ifs) openIfCount += ifs.length;

    const endifs = cleanLine.match(endifRegex);
    if (endifs) closeIfCount += endifs.length;

    // Count parenthesis
    for (const char of cleanLine) {
      if (char === '(') openParenCount++;
      if (char === ')') closeParenCount++;
    }

    // Collect DBIs used in expressions (skip DEFAULT FOR line itself)
    if (!cleanLine.startsWith('DEFAULT') && !cleanLine.startsWith('/*') && !cleanLine.startsWith('*')) {
      let match;
      while ((match = dbiPattern.exec(cleanLine)) !== null) {
        const word = match[1].toUpperCase();
        if (
          !word.startsWith('GET_') &&
          !word.startsWith('SET_') &&
          !word.startsWith('TO_') &&
          !word.startsWith('ADD_') &&
          !word.startsWith('DAYS_') &&
          !word.startsWith('ESS_') &&
          !word.startsWith('CMP_') &&
          !word.startsWith('IV_') &&
          !['DATE', 'NUMBER', 'TEXT', 'UNKNOWN'].includes(word)
        ) {
          referencedDbis.add(word);
        }
      }
    }

    // Warn about deprecated or invalid syntax
    if (cleanLine.includes('==')) {
      issues.push({
        id: `double-equals-${lineNum}`,
        type: 'error',
        line: lineNum,
        message: 'Invalid equality operator "==". Fast Formula uses single "=" for comparison.',
        suggestion: 'Change "==" to "=".',
      });
    }

    if (cleanLine.includes('!=') || cleanLine.includes('!==')) {
      issues.push({
        id: `not-equals-${lineNum}`,
        type: 'warning',
        line: lineNum,
        message: 'Prefer standard Fast Formula inequality operator "!=" or "<>".',
        suggestion: 'Ensure "<>" or "!=" is surrounded by spaces.',
      });
    }
  });

  // Check RETURN presence
  if (!hasReturnStatement) {
    issues.push({
      id: 'return-missing',
      type: 'error',
      message: 'Fast Formula lacks a RETURN statement.',
      suggestion: 'Every executable Fast Formula must conclude with RETURN <variable1>, <variable2>, ...',
    });
  }

  // Check Parenthesis balance
  if (openParenCount !== closeParenCount) {
    issues.push({
      id: 'paren-mismatch',
      type: 'error',
      message: `Parentheses mismatch: ${openParenCount} opening '(' vs ${closeParenCount} closing ')'.`,
      suggestion: 'Review conditional blocks and nested function calls to balance parenthesis.',
    });
  }

  // Check referenced DBIs against defaults
  for (const dbi of referencedDbis) {
    if (dbi.length > 5 && !declaredDefaults.has(dbi) && !dbi.startsWith('L_')) {
      issues.push({
        id: `missing-default-${dbi}`,
        type: 'warning',
        message: `Database Item or variable '${dbi}' may be missing a 'DEFAULT FOR' declaration.`,
        suggestion: `Add: DEFAULT FOR ${dbi} IS 0 (or ' ' / '1900/01/01' for date) at the top of the formula.`,
      });
    }
  }

  const errors = issues.filter((i) => i.type === 'error');
  const warnings = issues.filter((i) => i.type === 'warning');

  return {
    isValid: errors.length === 0,
    errorCount: errors.length,
    warningCount: warnings.length,
    issues,
    metrics: {
      totalLines: lines.length,
      dbiCount: declaredDefaults.size,
    },
  };
}

/**
 * Validates Oracle HCM Data Loader (HDL) syntax and column parity
 */
export function validateHDL(code: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const lines = code.split('\n');

  let metadataCount = 0;
  let mergeCount = 0;
  let hasSetStatement = false;

  // Map of ObjectName -> expected column count from METADATA line
  const metadataColumnMap = new Map<string, { count: number; line: number; attributes: string[] }>();

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    if (trimmed.startsWith('SET ')) {
      hasSetStatement = true;
      return;
    }

    if (trimmed.startsWith('METADATA|')) {
      metadataCount++;
      const tokens = trimmed.split('|');
      if (tokens.length < 3) {
        issues.push({
          id: `meta-too-short-${lineNum}`,
          type: 'error',
          line: lineNum,
          message: 'METADATA line must have at least ObjectName and 1 attribute: METADATA|ObjectName|Attr1|...',
        });
        return;
      }

      const objectName = tokens[1].trim();
      const attributes = tokens.slice(2);
      metadataColumnMap.set(objectName, {
        count: tokens.length,
        line: lineNum,
        attributes,
      });

      // Check for primary key presence
      const hasSourceSystem = attributes.some(
        (a) => a.includes('SourceSystemId') || a.includes('SourceSystemOwner') || a.includes('PersonNumber')
      );
      if (!hasSourceSystem) {
        issues.push({
          id: `meta-no-key-${lineNum}`,
          type: 'warning',
          line: lineNum,
          message: `Object '${objectName}' METADATA may be missing primary key identifier (SourceSystemId or UserKey).`,
          suggestion: 'Ensure SourceSystemOwner and SourceSystemId or appropriate user keys are declared.',
        });
      }
    } else if (trimmed.startsWith('MERGE|') || trimmed.startsWith('DELETE|')) {
      mergeCount++;
      const tokens = trimmed.split('|');
      const action = tokens[0];
      const objectName = tokens[1]?.trim();

      if (!objectName) {
        issues.push({
          id: `merge-no-obj-${lineNum}`,
          type: 'error',
          line: lineNum,
          message: `${action} row is missing ObjectName after first delimiter.`,
        });
        return;
      }

      const metaInfo = metadataColumnMap.get(objectName);
      if (!metaInfo) {
        issues.push({
          id: `merge-no-meta-${lineNum}`,
          type: 'error',
          line: lineNum,
          message: `${action} row for '${objectName}' does not have a preceding METADATA definition line.`,
          suggestion: `Add 'METADATA|${objectName}|...' before this ${action} line.`,
        });
      } else if (tokens.length !== metaInfo.count) {
        // Critical Oracle HDL Error: Column Count Mismatch
        issues.push({
          id: `column-mismatch-${lineNum}`,
          type: 'error',
          line: lineNum,
          message: `Column count mismatch for '${objectName}': METADATA has ${metaInfo.count} tokens, but ${action} has ${tokens.length} tokens.`,
          detail: `Oracle Loader Error HRC-3145: The number of values provided does not match the metadata definition. Check for missing or extra '|' delimiters.`,
          suggestion: `Adjust line ${lineNum} to have exactly ${metaInfo.count - 2} values following '${action}|${objectName}|'.`,
        });
      }
    } else {
      issues.push({
        id: `unknown-line-${lineNum}`,
        type: 'warning',
        line: lineNum,
        message: `Line does not start with SET, METADATA, MERGE, or DELETE.`,
        suggestion: 'Ensure lines follow Oracle HDL standard directives.',
      });
    }
  });

  if (metadataCount === 0) {
    issues.push({
      id: 'no-metadata',
      type: 'error',
      message: 'No valid METADATA definition line found in HDL file.',
      suggestion: 'HDL files must include at least one METADATA|<BusinessObject>|... line.',
    });
  }

  if (mergeCount === 0) {
    issues.push({
      id: 'no-merge',
      type: 'warning',
      message: 'No MERGE or DELETE payload lines found in HDL file.',
      suggestion: 'Add at least one sample MERGE line for staging testing.',
    });
  }

  const errors = issues.filter((i) => i.type === 'error');
  const warnings = issues.filter((i) => i.type === 'warning');

  return {
    isValid: errors.length === 0,
    errorCount: errors.length,
    warningCount: warnings.length,
    issues,
    metrics: {
      totalLines: lines.length,
      metadataCount,
      mergeCount,
    },
  };
}

/**
 * Intelligent local rule-based Fast Formula generator
 */
export function generateLocalFastFormula(prompt: string, context?: Partial<FastFormulaContext>): string {
  const p = prompt.toLowerCase();

  // Infer formula type from prompt keywords
  let inferredType = 'Oracle Payroll';
  let defaultFormulaName = 'FF_CUSTOM_PAYROLL_RULE';

  if (p.includes('absence') || p.includes('accrual') || p.includes('pto') || p.includes('leave')) {
    inferredType = 'Global Absence Accrual';
    defaultFormulaName = 'FF_PTO_ACCRUAL_BAND_RULE';
  } else if (p.includes('validat') || p.includes('prevent') || p.includes('overtime') || p.includes('max hour')) {
    inferredType = 'Element Input Validation';
    defaultFormulaName = 'FF_EIV_INPUT_VALIDATION_RULE';
  } else if (p.includes('compensation') || p.includes('eligib') || p.includes('merit') || p.includes('plan selection')) {
    inferredType = 'Compensation Person Selection';
    defaultFormulaName = 'FF_CMP_PERSON_SELECTION_RULE';
  } else if (p.includes('extract') || p.includes('ue_') || p.includes('transformation')) {
    inferredType = 'HCM Extract Rule';
    defaultFormulaName = 'FF_EXTRACT_TRANSFORMATION_RULE';
  } else if (p.includes('retention') || p.includes('bonus')) {
    inferredType = 'Oracle Payroll';
    defaultFormulaName = 'FF_RETENTION_BONUS_CALC';
  }

  const name = (context?.formulaName || defaultFormulaName).toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  const type = context?.formulaType || inferredType;
  const author = context?.author || 'Oracle HCM Consultant';
  const effDate = context?.effectiveDate || new Date().toISOString().slice(0, 10);

  // Detect percentages
  const pctMatches = prompt.match(/(\d+(?:\.\d+)?)\s*%/g);
  const rates = pctMatches ? pctMatches.map((m) => parseFloat(m) / 100) : [0.15, 0.2];

  // Detect cap amounts
  const capMatch = prompt.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*(?:cap|maximum|limit)/i) || prompt.match(/cap\s*(?:at|of)?\s*\$?\s*([\d,]+)/i);
  const capAmount = capMatch ? capMatch[1].replace(/,/g, '') : '25000';

  // Detect tenure years
  const tenureMatch = prompt.match(/(\d+)\+?\s*(?:year|yr)/gi);
  const minYears = tenureMatch && tenureMatch.length > 0 ? parseInt(tenureMatch[0], 10) : 3;

  // Logging logic
  const logMethod = context?.loggingMethod || 'ESS_LOG_WRITE';

  return `/* *********************************************************************************
FORMULA NAME : ${name}
FORMULA TYPE : ${type}
DESCRIPTION  : Automated formula generated based on consultant business specification:
               "${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}"
INPUTS       : Standard Execution Context
OUTPUTS      : ${context?.returnVariables || 'l_calc_value, l_status, l_message'}
HISTORY      :
  Date        Author                   Version   Details
  ---------------------------------------------------------------------------------
  ${effDate}  ${author}  1.0       Automated FusionForge Synthesis
********************************************************************************* */

/* --- DATABASE ITEM DEFAULTS --- */
DEFAULT FOR PER_ASG_PERSON_NUMBER IS '-1'
DEFAULT FOR CMP_SALARY IS 0
DEFAULT FOR PER_ASG_HIRE_DATE IS '1900/01/01 00:00:00' (date)
DEFAULT FOR PER_ASG_ADJUSTED_SVC_DATE IS '1900/01/01 00:00:00' (date)
DEFAULT FOR PER_ASG_JOB_NAME IS 'UNKNOWN'
DEFAULT FOR PER_ASG_DEPARTMENT_NAME IS 'NONE'
DEFAULT FOR PAY_EARN_PERIOD_END_DATE IS '4712/12/31 00:00:00' (date)

/* --- INPUT PARAMETERS --- */
INPUTS ARE

/* --- LOCAL VARIABLE INITIALIZATION --- */
l_calc_value    = 0
l_rate          = ${rates[0] || 0.15}
l_cap_limit     = ${capAmount}
l_tenure_years  = 0
l_status        = 'S'
l_message       = 'SUCCESS'
l_eff_date      = GET_CONTEXT(EFFECTIVE_DATE, '1900/01/01 00:00:00' (date))
l_person_number = PER_ASG_PERSON_NUMBER

/* --- DIAGNOSTIC LOGGING --- */
${logMethod}('=====================================================')
${logMethod}('START FORMULA: ${name} FOR PERSON ' || l_person_number)
${logMethod}('Effective Date Context: ' || TO_CHAR(l_eff_date, 'YYYY/MM/DD'))
${logMethod}('Current CMP_SALARY: ' || TO_CHAR(CMP_SALARY))

/* --- INPUT VALIDATION --- */
IF CMP_SALARY <= 0 THEN
(
  l_status  = 'W'
  l_message = 'Base salary is zero or unassigned for Person ' || l_person_number
  ${logMethod}(l_message)
  RETURN l_calc_value, l_status, l_message
)

/* --- TENURE / DURATION EVALUATION --- */
IF PER_ASG_HIRE_DATE != '1900/01/01 00:00:00' (date) THEN
(
  l_tenure_years = ROUND(DAYS_BETWEEN(l_eff_date, PER_ASG_HIRE_DATE) / 365.25, 2)
  ${logMethod}('Calculated Tenure Years: ' || TO_CHAR(l_tenure_years))
)

/* --- CONDITIONAL CALCULATION LOGIC --- */
IF l_tenure_years >= ${minYears + 2} THEN
(
  l_rate = ${rates[1] || 0.20}
  ${logMethod}('Applied High Tier Rate: ' || TO_CHAR(l_rate))
)
ELSE IF l_tenure_years >= ${minYears} THEN
(
  l_rate = ${rates[0] || 0.15}
  ${logMethod}('Applied Standard Tier Rate: ' || TO_CHAR(l_rate))
)
ELSE
(
  l_rate = 0.05
  ${logMethod}('Applied Base Entry Tier Rate: ' || TO_CHAR(l_rate))
)

/* Calculate Raw Value */
l_calc_value = ROUND(CMP_SALARY * l_rate, 2)

/* Enforce Ceiling Cap */
IF l_calc_value > l_cap_limit THEN
(
  ${logMethod}('Calculated value ' || TO_CHAR(l_calc_value) || ' exceeds cap limit. Applying cap: ' || TO_CHAR(l_cap_limit))
  l_calc_value = l_cap_limit
)

${logMethod}('FINAL RESULT: ' || TO_CHAR(l_calc_value) || ' | STATUS: ' || l_status)
${logMethod}('END FORMULA: ${name}')
${logMethod}('=====================================================')

RETURN ${context?.returnVariables || 'l_calc_value, l_status, l_message'}`;
}

/**
 * Intelligent local rule-based HDL generator
 */
export function generateLocalHDL(prompt: string, context: HDLContext): string {
  const obj = context.objectType || 'Worker';
  const owner = context.sourceSystemOwner || 'FUSION_FORGE';
  const startDate = context.effectiveStartDate || '2026/04/01';
  const endDate = context.effectiveEndDate || '4712/12/31';
  const action = context.action || 'MERGE';

  if (obj === 'Salary') {
    return `${context.purgeFutureChanges ? 'SET PURGE_FUTURE_CHANGES Y\n' : ''}METADATA|Salary|SourceSystemOwner|SourceSystemId|AssignmentId(SourceSystemId)|DateFrom|DateTo|SalaryAmount|SalaryBasisName|ActionCode
${action}|Salary|${owner}|SAL_108492_${startDate.replace(/[^0-9]/g, '')}|ASG_108492|${startDate}|${endDate}|165000|Annual US Salary Basis|MERIT_INC`;
  }

  if (obj === 'ElementEntry') {
    return `METADATA|ElementEntry|SourceSystemOwner|SourceSystemId|AssignmentId(SourceSystemId)|ElementName|LegislativeDataGroupName|EffectiveStartDate|EffectiveEndDate|EntryType
${action}|ElementEntry|${owner}|EE_ALLOWANCE_108492|ASG_108492|Remote Work Allowance|US Legislative Data Group|${startDate}|${endDate}|E

METADATA|ElementEntryValue|SourceSystemOwner|SourceSystemId|ElementEntryId(SourceSystemId)|InputValueName|ScreenEntryValue|EffectiveStartDate|EffectiveEndDate
${action}|ElementEntryValue|${owner}|EEV_ALLOWANCE_108492_01|EE_ALLOWANCE_108492|Amount|350.00|${startDate}|${endDate}`;
  }

  if (obj === 'Department') {
    return `${context.purgeFutureChanges ? 'SET PURGE_FUTURE_CHANGES Y\n' : ''}METADATA|Organization|SourceSystemOwner|SourceSystemId|ClassificationCode|Name|EffectiveStartDate|EffectiveEndDate|Status
${action}|Organization|${owner}|ORG_DEPT_ENTERPRISE_AI|DEPARTMENT|Enterprise AI Systems Group|${startDate}|${endDate}|A`;
  }

  if (obj === 'Job') {
    return `METADATA|Job|SourceSystemOwner|SourceSystemId|JobCode|SetCode|Name|EffectiveStartDate|EffectiveEndDate|ActiveStatus
${action}|Job|${owner}|JOB_PRIN_CONSULT|PRIN_CONSULT|COMMON|Principal Cloud Solutions Consultant|${startDate}|${endDate}|A`;
  }

  // Default Worker
  return `${context.purgeFutureChanges ? 'SET PURGE_FUTURE_CHANGES Y\n' : 'SET PURGE_FUTURE_CHANGES N\n'}METADATA|Worker|SourceSystemOwner|SourceSystemId|PersonNumber|EffectiveStartDate|EffectiveEndDate
${action}|Worker|${owner}|PER_108492|108492|${startDate}|${endDate}

METADATA|WorkTerms|SourceSystemOwner|SourceSystemId|PeriodOfServiceId(SourceSystemId)|PersonNumber|AssignmentNumber|EffectiveStartDate|EffectiveEndDate|LegalEmployerName|ActionCode
${action}|WorkTerms|${owner}|WT_108492|POS_108492|108492|ET108492|${startDate}|${endDate}|US Legal Employer LLC|PROMOTION

METADATA|Assignment|SourceSystemOwner|SourceSystemId|WorkTermsAssignmentId(SourceSystemId)|PeriodOfServiceId(SourceSystemId)|PersonNumber|AssignmentNumber|EffectiveStartDate|EffectiveEndDate|ActionCode|JobCode|DepartmentName|BusinessUnitName
${action}|Assignment|${owner}|ASG_108492|WT_108492|POS_108492|108492|E108492|${startDate}|${endDate}|PROMOTION|JOB_SR_SYSENG|Cloud Operations|US Technology BU`;
}

/**
 * Extracts pure code from raw response string (handling markdown fences and commentaries)
 */
export function extractCleanCode(rawText: string, mode: 'fast_formula' | 'hdl'): string {
  if (!rawText) return '';

  // Check if code contains markdown code block: ```[language] ... ```
  const codeBlockMatch = rawText.match(/```(?:sql|text|dat)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    const code = codeBlockMatch[1].trim();
    // If there is additional text after the code block (like a consultant checklist), format it as comments for Fast Formulas
    const afterCode = rawText.replace(/```(?:sql|text|dat)?\s*[\s\S]*?```/i, '').trim();
    if (afterCode && mode === 'fast_formula' && !code.includes(afterCode.slice(0, 30))) {
      return `${code}\n\n/* *********************************************************************************\n${afterCode.replace(/\/\*|\*\//g, '')}\n********************************************************************************* */`;
    }
    return code;
  }

  // Fallback: strip leading/trailing single fences
  return rawText
    .replace(/^```[a-z0-9_-]*\n/i, '')
    .replace(/\n```$/g, '')
    .trim();
}

/**
 * Formats code nicely
 */
export function formatCode(code: string, mode: 'fast_formula' | 'hdl'): string {
  if (mode === 'fast_formula') {
    const lines = code.split('\n');
    return lines
      .map((line) => line.trimEnd())
      .join('\n');
  } else {
    // For HDL, ensure clean pipe separation without trailing spaces inside tokens
    return code
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed.includes('|')) return trimmed;
        return trimmed
          .split('|')
          .map((token) => token.trim())
          .join('|');
      })
      .join('\n');
  }
}
