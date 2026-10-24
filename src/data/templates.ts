import { QuickTemplate } from '../types';

export const QUICK_TEMPLATES: QuickTemplate[] = [
  {
    id: 'retention-bonus-calc',
    mode: 'fast_formula',
    title: 'Retention Bonus Calculation',
    subtitle: 'Tenure-tiered retention bonus with salary cap & ESS logging',
    category: 'Payroll & Compensation',
    prompt:
      'Calculate retention bonus based on employee tenure: if tenure is 3+ years give 15% of annual salary; if 5+ years give 20%. Cap bonus at $25,000. Fetch PER_ASG_PERSON_NUMBER, CMP_SALARY, and PER_ASG_HIRE_DATE. Include ESS_LOG_WRITE diagnostics and error handling for zero salary.',
    context: {
      formulaName: 'FF_RETENTION_BONUS_CALC',
      formulaType: 'Oracle Payroll',
      effectiveDate: '2026-01-01',
      legislativeDataGroup: 'US Legislative Data Group',
      enableLogging: true,
      loggingMethod: 'ESS_LOG_WRITE',
      author: 'Oracle HCM Consultant',
      returnVariables: 'l_bonus_amount, l_eligibility_status, l_error_message',
    },
    checklist: [
      'Verify CMP_SALARY DBI is enabled and assigned to the Legislative Data Group in Fast Formulas setup.',
      'Confirm Element Eligibility is linked to the appropriate Payroll Element for the target LDG.',
      'Ensure standard date formats (YYYY/MM/DD) match the payroll run context.',
      'Check that ESS job "Compile Formula" completes with SUCCESS status before running payroll test batch.',
    ],
    defaultCode: `/* *********************************************************************************
FORMULA NAME : FF_RETENTION_BONUS_CALC
FORMULA TYPE : Oracle Payroll
DESCRIPTION  : Calculates a tenure-tiered retention bonus (15% for 3+ yrs, 20% for 5+ yrs)
               capped at $25,000 with detailed ESS_LOG_WRITE diagnostics.
INPUTS       : None (Uses Database Items)
OUTPUTS      : l_bonus_amount, l_eligibility_status, l_error_message
HISTORY      :
  Date        Author                 Version   Details
  ---------------------------------------------------------------------------------
  2026-01-01  Oracle HCM Consultant  1.0       Production baseline formula
********************************************************************************* */

/* --- DATABASE ITEM DEFAULTS --- */
DEFAULT FOR PER_ASG_PERSON_NUMBER IS '-1'
DEFAULT FOR CMP_SALARY IS 0
DEFAULT FOR PER_ASG_HIRE_DATE IS '1900/01/01 00:00:00' (date)
DEFAULT FOR PAY_EARN_PERIOD_END_DATE IS '4712/12/31 00:00:00' (date)

/* --- INPUT PARAMETERS --- */
INPUTS ARE

/* --- LOCAL VARIABLE INITIALIZATION --- */
l_bonus_amount       = 0
l_bonus_rate         = 0
l_tenure_years       = 0
l_bonus_cap          = 25000
l_eligibility_status = 'N'
l_error_message      = 'SUCCESS'
l_eff_date           = GET_CONTEXT(EFFECTIVE_DATE, '1900/01/01 00:00:00' (date))
l_person_num         = PER_ASG_PERSON_NUMBER

/* --- DIAGNOSTIC LOGGING ENTRY --- */
ESS_LOG_WRITE('--- START FF_RETENTION_BONUS_CALC FOR PERSON: ' || l_person_num || ' ---')
ESS_LOG_WRITE('Effective Date: ' || TO_CHAR(l_eff_date, 'YYYY/MM/DD'))
ESS_LOG_WRITE('Base Salary: ' || TO_CHAR(CMP_SALARY))

/* --- SALARY VALIDATION --- */
IF CMP_SALARY <= 0 THEN
(
  l_error_message = 'ERROR: Employee base salary is zero or missing for Person ' || l_person_num
  ESS_LOG_WRITE(l_error_message)
  RETURN l_bonus_amount, l_eligibility_status, l_error_message
)

/* --- TENURE CALCULATION --- */
IF PER_ASG_HIRE_DATE = '1900/01/01 00:00:00' (date) THEN
(
  l_error_message = 'ERROR: Hire date not found on primary assignment.'
  ESS_LOG_WRITE(l_error_message)
  RETURN l_bonus_amount, l_eligibility_status, l_error_message
)

l_tenure_years = ROUND(DAYS_BETWEEN(l_eff_date, PER_ASG_HIRE_DATE) / 365.25, 2)
ESS_LOG_WRITE('Calculated Tenure (Years): ' || TO_CHAR(l_tenure_years))

/* --- BONUS TIER LOGIC --- */
IF l_tenure_years >= 5.0 THEN
(
  l_bonus_rate = 0.20
  l_eligibility_status = 'Y'
)
ELSE IF l_tenure_years >= 3.0 THEN
(
  l_bonus_rate = 0.15
  l_eligibility_status = 'Y'
)
ELSE
(
  l_bonus_rate = 0.00
  l_eligibility_status = 'N'
  ESS_LOG_WRITE('Worker tenure under 3 years. Not eligible for retention bonus.')
)

/* --- CALCULATE AMOUNT & APPLY HARD CAP --- */
IF l_eligibility_status = 'Y' THEN
(
  l_bonus_amount = ROUND(CMP_SALARY * l_bonus_rate, 2)
  IF l_bonus_amount > l_bonus_cap THEN
  (
    ESS_LOG_WRITE('Calculated bonus ' || TO_CHAR(l_bonus_amount) || ' exceeds cap. Applying cap: ' || TO_CHAR(l_bonus_cap))
    l_bonus_amount = l_bonus_cap
  )
)

ESS_LOG_WRITE('Final Bonus: ' || TO_CHAR(l_bonus_amount) || ' | Status: ' || l_eligibility_status)
ESS_LOG_WRITE('--- END FF_RETENTION_BONUS_CALC ---')

RETURN l_bonus_amount, l_eligibility_status, l_error_message`,
  },
  {
    id: 'absence-accrual-band',
    mode: 'fast_formula',
    title: 'Absence Accrual Band Formula',
    subtitle: 'Seniority-based PTO accrual rate assignment with carryover ceiling',
    category: 'Absence Management',
    prompt:
      'Global Absence Accrual formula that awards PTO hours per month based on length of service: 10 hours/month for 0-2 years, 14 hours for 2-5 years, and 18 hours for 5+ years. Maximum carryover rollover is 40 hours. Prorate if worker is part-time based on PER_ASG_FTE_VALUE.',
    context: {
      formulaName: 'FF_PTO_ACCRUAL_BAND_RULE',
      formulaType: 'Global Absence Accrual',
      effectiveDate: '2026-01-01',
      legislativeDataGroup: 'Enterprise Scope',
      enableLogging: true,
      loggingMethod: 'SET_LOG',
      author: 'Absence Solution Consultant',
      returnVariables: 'l_accrual, l_ceiling, l_carryover_limit',
    },
    checklist: [
      'Navigate to My Client Groups > Absences > Absence Plans and assign formula under Accrual Definition.',
      'Check that PER_ASG_FTE_VALUE DBI has valid assignment context on part-time workers.',
      'Verify carryover date rule is configured to expire unused hours on March 31 of following year.',
      'Run "Calculate Accruals and Balances" process in draft mode for sample population.',
    ],
    defaultCode: `/* *********************************************************************************
FORMULA NAME : FF_PTO_ACCRUAL_BAND_RULE
FORMULA TYPE : Global Absence Accrual
DESCRIPTION  : Calculates monthly PTO accrual based on service bands:
               0-2 years: 10 hrs/mo | 2-5 years: 14 hrs/mo | 5+ years: 18 hrs/mo.
               Applies FTE proration and sets 40-hour carryover limit.
INPUTS       : IV_ACCRUAL_PERIOD_START_DATE, IV_ACCRUAL_PERIOD_END_DATE
OUTPUTS      : l_accrual, l_ceiling, l_carryover_limit
********************************************************************************* */

/* --- DATABASE ITEM DEFAULTS --- */
DEFAULT FOR PER_ASG_ADJUSTED_SVC_DATE IS '1900/01/01 00:00:00' (date)
DEFAULT FOR PER_ASG_HIRE_DATE IS '1900/01/01 00:00:00' (date)
DEFAULT FOR PER_ASG_FTE_VALUE IS 1.0
DEFAULT FOR ANC_PER_ABS_PLAN_ACCRUAL_BALANCE IS 0

/* --- INPUTS --- */
INPUTS ARE IV_ACCRUAL_PERIOD_START_DATE (date),
           IV_ACCRUAL_PERIOD_END_DATE (date)

/* --- INITIALIZATION --- */
l_accrual         = 0
l_ceiling         = 240
l_carryover_limit = 40
l_years_service   = 0
l_base_rate       = 10
l_fte             = PER_ASG_FTE_VALUE
l_service_date    = PER_ASG_ADJUSTED_SVC_DATE

IF l_service_date = '1900/01/01 00:00:00' (date) THEN
(
  l_service_date = PER_ASG_HIRE_DATE
)

/* Determine service length */
l_years_service = DAYS_BETWEEN(IV_ACCRUAL_PERIOD_END_DATE, l_service_date) / 365.25

IF l_years_service >= 5.0 THEN
(
  l_base_rate = 18.0
)
ELSE IF l_years_service >= 2.0 THEN
(
  l_base_rate = 14.0
)
ELSE
(
  l_base_rate = 10.0
)

/* Prorate by FTE (e.g. 0.5 for 20hr/week) */
l_accrual = ROUND(l_base_rate * l_fte, 4)

RETURN l_accrual, l_ceiling, l_carryover_limit`,
  },
  {
    id: 'element-validation-overtime',
    mode: 'fast_formula',
    title: 'Element Input Validation: Overtime Cap',
    subtitle: 'Enforces maximum bi-weekly overtime hours and validates rate codes',
    category: 'Global Payroll',
    prompt:
      'Element Input Validation fast formula that prevents submission if entered Overtime Hours exceed 60 hours in a single pay period or if the entered rate multiplier is negative. Display custom user-friendly error message in Payroll UI.',
    context: {
      formulaName: 'FF_EIV_OVERTIME_CAP_RULE',
      formulaType: 'Element Input Validation',
      effectiveDate: '2026-01-01',
      legislativeDataGroup: 'US Legislative Data Group',
      enableLogging: true,
      loggingMethod: 'ESS_LOG_WRITE',
      author: 'Senior Payroll Specialist',
      returnVariables: 'l_status, l_message',
    },
    checklist: [
      'Open Manage Elements > Element Summary > Input Values > Validation tab.',
      'Attach this formula under "Validation Formula" for the target Hours input value.',
      'Test in "Manage Element Entries" screen by intentionally inputting 65 hours to confirm UI error banner.',
      'Ensure error string does not exceed 240 characters for Oracle standard dialogs.',
    ],
    defaultCode: `/* *********************************************************************************
FORMULA NAME : FF_EIV_OVERTIME_CAP_RULE
FORMULA TYPE : Element Input Validation
DESCRIPTION  : Prevents entry of overtime hours greater than 60 in a single period
               or invalid negative rate entries.
INPUTS       : ENTRY_VALUE (number)
OUTPUTS      : l_status, l_message
********************************************************************************* */

DEFAULT FOR ENTRY_VALUE IS 0

INPUTS ARE ENTRY_VALUE (number)

l_status  = 'S'
l_message = 'Validation successful.'
l_max_ot  = 60.0

IF ENTRY_VALUE < 0 THEN
(
  l_status  = 'E'
  l_message = 'Overtime hours cannot be negative. Please enter a valid non-negative number.'
  RETURN l_status, l_message
)

IF ENTRY_VALUE > l_max_ot THEN
(
  l_status  = 'E'
  l_message = 'Entered Overtime Hours (' || TO_CHAR(ENTRY_VALUE) || ') exceeds maximum allowed limit of ' || TO_CHAR(l_max_ot) || ' hours per pay period.'
  RETURN l_status, l_message
)

RETURN l_status, l_message`,
  },
  {
    id: 'hdl-worker-assignment-update',
    mode: 'hdl',
    title: 'Worker Assignment & Job Update',
    subtitle: 'Worker.dat file to update job, department, and manager on effective date',
    category: 'Worker & Assignment (HDL)',
    prompt:
      'Generate Worker.dat HDL file to update worker assignment record effective 2026-04-01. Change job to Senior Systems Engineer (JOB_SR_SYSENG), Department to Cloud Operations (DEPT_CLOUD_OPS), and assign Action Code PROMOTION. Use SourceSystemOwner FUSION_FORGE.',
    context: {
      objectType: 'Worker',
      action: 'MERGE',
      keyType: 'SourceSystemId',
      sourceSystemOwner: 'FUSION_FORGE',
      purgeFutureChanges: false,
      effectiveStartDate: '2026-04-01',
      effectiveEndDate: '4712/12/31',
      outputFormat: 'dat',
    },
    checklist: [
      'Verify target Job Code (JOB_SR_SYSENG) and Department Code exist and are active in Fusion as of 2026-04-01.',
      'Ensure Source System Owner "FUSION_FORGE" is registered in Setup and Maintenance > Manage Source Systems.',
      'Confirm Action Code "PROMOTION" is mapped to Action Reason in Manage Actions.',
      'Compress file as Worker.zip before uploading to Data Exchange > Import and Load Data.',
    ],
    defaultCode: `SET PURGE_FUTURE_CHANGES N
METADATA|Worker|SourceSystemOwner|SourceSystemId|PersonNumber|EffectiveStartDate|EffectiveEndDate
MERGE|Worker|FUSION_FORGE|PER_108492|108492|2026/04/01|4712/12/31

METADATA|WorkTerms|SourceSystemOwner|SourceSystemId|PeriodOfServiceId(SourceSystemId)|PersonNumber|AssignmentNumber|EffectiveStartDate|EffectiveEndDate|LegalEmployerName|ActionCode
MERGE|WorkTerms|FUSION_FORGE|WT_108492|POS_108492|108492|ET108492|2026/04/01|4712/12/31|US Legal Employer LLC|PROMOTION

METADATA|Assignment|SourceSystemOwner|SourceSystemId|WorkTermsAssignmentId(SourceSystemId)|PeriodOfServiceId(SourceSystemId)|PersonNumber|AssignmentNumber|EffectiveStartDate|EffectiveEndDate|ActionCode|JobCode|DepartmentName|BusinessUnitName
MERGE|Assignment|FUSION_FORGE|ASG_108492|WT_108492|POS_108492|108492|E108492|2026/04/01|4712/12/31|PROMOTION|JOB_SR_SYSENG|Cloud Operations|US Technology BU`,
  },
  {
    id: 'hdl-salary-change',
    mode: 'hdl',
    title: 'Worker Salary Change with Basis',
    subtitle: 'Salary.dat HDL to record merit increase and link salary basis',
    category: 'Compensation (HDL)',
    prompt:
      'Generate Salary.dat HDL file to record a merit salary increase to $165,000 for employee assignment ASG_108492 starting 2026-04-01 with Annual US Salary Basis and Action Code MERIT_INC.',
    context: {
      objectType: 'Salary',
      action: 'MERGE',
      keyType: 'SourceSystemId',
      sourceSystemOwner: 'FUSION_FORGE',
      purgeFutureChanges: false,
      effectiveStartDate: '2026-04-01',
      effectiveEndDate: '4712/12/31',
      outputFormat: 'dat',
    },
    checklist: [
      'Ensure the worker assignment ASG_108492 exists and is active on or prior to 2026-04-01.',
      'Confirm the Salary Basis "Annual US Salary Basis" is active and its payroll element is linked to worker LDG.',
      'Ensure Currency Code matches the Legal Employer / LDG configuration.',
      'Check that DateFrom (2026/04/01) does not overlap with an existing unapproved salary proposal.',
    ],
    defaultCode: `SET PURGE_FUTURE_CHANGES N
METADATA|Salary|SourceSystemOwner|SourceSystemId|AssignmentId(SourceSystemId)|DateFrom|DateTo|SalaryAmount|SalaryBasisName|ActionCode
MERGE|Salary|FUSION_FORGE|SAL_108492_20260401|ASG_108492|2026/04/01|4712/12/31|165000|Annual US Salary Basis|MERIT_INC`,
  },
  {
    id: 'hdl-element-entry-allowance',
    mode: 'hdl',
    title: 'Element Entry Allowance Assignment',
    subtitle: 'ElementEntry.dat for recurring transportation or tech stipend',
    category: 'Global Payroll (HDL)',
    prompt:
      'Generate ElementEntry.dat and ElementEntryValue.dat HDL lines to assign a recurring Remote Work Allowance of $350.00/month to worker assignment ASG_108492 in US Legislative Data Group from 2026-04-01 to 4712/12/31.',
    context: {
      objectType: 'ElementEntry',
      action: 'MERGE',
      keyType: 'SourceSystemId',
      sourceSystemOwner: 'FUSION_FORGE',
      purgeFutureChanges: false,
      effectiveStartDate: '2026-04-01',
      effectiveEndDate: '4712/12/31',
      outputFormat: 'dat',
    },
    checklist: [
      'Verify "Remote Work Allowance" element definition has an active Element Eligibility Link matching worker BU/Job.',
      'Ensure Input Value Name "Amount" matches exact casing in Manage Elements.',
      'Ensure EntryType is "E" (Element Entry).',
      'Check that Legislative Data Group Name matches "US Legislative Data Group" exactly.',
    ],
    defaultCode: `METADATA|ElementEntry|SourceSystemOwner|SourceSystemId|AssignmentId(SourceSystemId)|ElementName|LegislativeDataGroupName|EffectiveStartDate|EffectiveEndDate|EntryType
MERGE|ElementEntry|FUSION_FORGE|EE_REMOTE_108492|ASG_108492|Remote Work Allowance|US Legislative Data Group|2026/04/01|4712/12/31|E

METADATA|ElementEntryValue|SourceSystemOwner|SourceSystemId|ElementEntryId(SourceSystemId)|InputValueName|ScreenEntryValue|EffectiveStartDate|EffectiveEndDate
MERGE|ElementEntryValue|FUSION_FORGE|EEV_REMOTE_108492_AMT|EE_REMOTE_108492|Amount|350.00|2026/04/01|4712/12/31`,
  },
];
