import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize GoogleGenAI if GEMINI_API_KEY is available
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

// AI Generation endpoint for Oracle Fusion Fast Formulas & HDL
app.post('/api/generate', async (req: Request, res: Response) => {
  const { mode, prompt, context } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Prompt is required' });
    return;
  }

  if (!process.env.GEMINI_API_KEY || !ai) {
    res.status(503).json({
      error: 'GEMINI_API_KEY is not configured on the server. Falling back to local generation engine.',
      isFallback: true,
    });
    return;
  }

  try {
    let systemInstruction = '';

    if (mode === 'fast_formula' || !mode) {
      systemInstruction = `You are a Principal Oracle Fusion HCM Technical Architect and Fast Formula specialist.
Your task is to generate complete, production-grade, syntactically pristine Oracle Fast Formula code (.ff) based on the user's prompt.

STRICT FAST FORMULA SYNTAX & CONVENTIONS RULES:
1. Header comments banner:
   /* *********************************************************************************
   FORMULA NAME : [Pick an idiomatic name like FF_RETENTION_BONUS_CALC, in uppercase]
   FORMULA TYPE : [Determine the exact Oracle type: Oracle Payroll, Global Absence Accrual, Compensation Person Selection, Element Input Validation, or HCM Extract Rule]
   DESCRIPTION  : [Clear concise description of formula logic]
   INPUTS       : [Inputs used]
   OUTPUTS      : [Return variables]
   HISTORY      :
     Date        Author          Version   Details
     -----------------------------------------------------------------------------
     ${new Date().toISOString().slice(0, 10)}  Consultant      1.0       Initial Creation
   ********************************************************************************* */

2. Variable Defaults:
   Every single Database Item (DBI) and input parameter MUST have a DEFAULT FOR clause at the top.
   Examples:
   DEFAULT FOR PER_ASG_PERSON_NUMBER IS '-1'
   DEFAULT FOR CMP_SALARY IS 0
   DEFAULT FOR PER_ASG_HIRE_DATE IS '1900/01/01 00:00:00' (date)

3. INPUTS ARE clause:
   INPUTS ARE [Param1 (data type)]

4. Variable declarations & naming:
   - Use local prefixes: l_ (e.g. l_salary, l_tenure, l_status, l_message)
   - Initialize all local variables

5. Conditionals & Logic:
   - Use valid Oracle Fast Formula syntax: IF ... THEN ( ... ) ELSE ( ... )
   - Use AND, OR, NOT, <>, =
   - Built-ins: GET_CONTEXT(), ESS_LOG_WRITE(), SET_LOG(), TO_NUMBER(), TO_DATE(), TO_CHAR(), TRUNC(), ROUND(), DAYS_BETWEEN()

6. Error handling & Diagnostics:
   - Log steps using ESS_LOG_WRITE('...')
   - Return clean status flags and audit messages

7. RETURN statement:
   - Explicit RETURN clause (e.g. RETURN l_amount, l_status, l_message)

Output only the clean Fast Formula code in a \`\`\`sql code block, with a brief 3-4 bullet checklist at the end.`;
    } else {
      systemInstruction = `You are an Oracle Fusion HCM Data Migration Lead and HCM Data Loader (HDL / HSDL) expert.
Your task is to generate clean, production-ready Oracle HCM Data Loader (.dat) or HCM Spreadsheet Data Loader (HSDL) metadata files.

STRICT HDL FORMATTING RULES:
1. Must strictly start with SET statements if needed, e.g.:
   SET PURGE_FUTURE_CHANGES Y
2. METADATA line:
   METADATA|BusinessObjectName|Attribute1|Attribute2|...
3. MERGE line(s):
   MERGE|BusinessObjectName|Value1|Value2|...
4. Delimiter:
   MUST be pipe '|'.
   CRITICAL: The number of pipe-separated tokens in the MERGE line MUST EXACTLY MATCH the number of tokens in the corresponding METADATA line!
5. Keys:
   Include appropriate SourceSystemOwner and SourceSystemId, or UserKeys.
   Default SourceSystemOwner: 'FUSION_FORGE' or user specified.
6. Effective Dating:
   Include EffectiveStartDate (YYYY/MM/DD) and EffectiveEndDate (4712/12/31) where business objects are date-tracked (Worker, Assignment, Salary, etc.).
7. Target Object: ${context?.objectType || 'Worker'}
8. Provide exact realistic sample rows and staging instructions for Oracle Fusion Data Exchange > Import and Load Data.`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.1, // Low temperature for maximum speed and deterministic syntax
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
      },
    });

    const generatedText = response.text || '';

    res.json({
      text: generatedText,
      mode,
    });
  } catch (error: any) {
    console.error('Error generating with Gemini API:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate content with Gemini',
      isFallback: true,
    });
  }
});

// Setup Vite in dev mode or static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FusionForge server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
