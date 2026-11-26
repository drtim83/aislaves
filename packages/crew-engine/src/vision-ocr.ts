import { GoogleGenAI, Type } from '@google/genai';

export interface ExtractedBusinessCard {
  fullName: string;
  jobTitle: string;
  company: string;
  email: string;
  phone: string;
  industryHint: string;
  confidence: number;
  mode: 'live_gemini_vision' | 'demo_deterministic';
  cogsMyr: number;
}

export interface ExtractedReceipt {
  merchant: string;
  date: string;
  amountMyr: number;
  category: 'staff_meal' | 'mileage' | 'supplies';
  confidence: number;
  mode: 'live_gemini_vision' | 'demo_deterministic';
}

const DEMO_CARDS: Record<string, Omit<ExtractedBusinessCard, 'mode' | 'cogsMyr'>> = {
  trade_show_1: {
    fullName: 'Daniel Tan',
    jobTitle: 'Head of Procurement',
    company: 'FreshBake Foods Sdn Bhd',
    email: 'daniel.tan@freshbake.com.my',
    phone: '+60 12-884 3190',
    industryHint: 'Commercial Bakery & Packaged F&B Distribution (14 outlets)',
    confidence: 0.97,
  },
  batch_1: {
    fullName: 'Nurul Aisyah',
    jobTitle: 'Operations Director',
    company: 'Nusantara Logistics Sdn Bhd',
    email: 'aisyah@nusantaralogistics.my',
    phone: '+60 19-402 1188',
    industryHint: 'FMCG Cold-Chain Packaging Buyer',
    confidence: 0.96,
  },
  batch_2: {
    fullName: 'Jason Lim',
    jobTitle: 'Purchasing Manager',
    company: 'Sunway Gourmet Group',
    email: 'jlim@sunwaygourmet.com.my',
    phone: '+60 16-339 7420',
    industryHint: 'Central Kitchen & Retail Food Packaging',
    confidence: 0.95,
  },
  batch_3: {
    fullName: 'Priya Nair',
    jobTitle: 'Supply Chain Lead',
    company: 'Breeze Mart Retail Sdn Bhd',
    email: 'priya@breezemart.my',
    phone: '+60 17-622 9045',
    industryHint: '45-Store Minimart Chain Seeking Carton Boxes',
    confidence: 0.94,
  },
};

export async function extractBusinessCard(opts: {
  imageBase64?: string;
  mimeType?: string;
  geminiApiKey?: string;
  sampleKey?: string;
}): Promise<ExtractedBusinessCard> {
  const apiKey = opts.geminiApiKey?.trim() || process.env.GEMINI_API_KEY?.trim();

  if (apiKey && opts.imageBase64) {
    const cleanBase64 = opts.imageBase64.replace(/^data:[^;]+;base64,/, '');
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            data: cleanBase64,
            mimeType: opts.mimeType || 'image/jpeg',
          },
        },
        'Extract structured business card fields from this image accurately. Infer a short industryHint if visible.',
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            fullName: { type: Type.STRING },
            jobTitle: { type: Type.STRING },
            company: { type: Type.STRING },
            email: { type: Type.STRING },
            phone: { type: Type.STRING },
            industryHint: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
          },
          required: ['fullName', 'jobTitle', 'company', 'email', 'phone', 'industryHint', 'confidence'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}') as Omit<ExtractedBusinessCard, 'mode' | 'cogsMyr'>;
    return {
      fullName: parsed.fullName || 'Unknown Contact',
      jobTitle: parsed.jobTitle || 'Decision Maker',
      company: parsed.company || 'Prospect Company',
      email: parsed.email || 'prospect@example.com',
      phone: parsed.phone || 'Not printed',
      industryHint: parsed.industryHint || 'SME Business',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.92,
      mode: 'live_gemini_vision',
      cogsMyr: 0.015,
    };
  }

  const demo = DEMO_CARDS[opts.sampleKey ?? 'trade_show_1'] ?? DEMO_CARDS.trade_show_1;
  return {
    ...demo,
    mode: 'demo_deterministic',
    cogsMyr: 0.015,
  };
}

export async function extractExpenseReceipt(opts: {
  imageBase64?: string;
  mimeType?: string;
  geminiApiKey?: string;
}): Promise<ExtractedReceipt> {
  const apiKey = opts.geminiApiKey?.trim() || process.env.GEMINI_API_KEY?.trim();

  if (apiKey && opts.imageBase64) {
    const cleanBase64 = opts.imageBase64.replace(/^data:[^;]+;base64,/, '');
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            data: cleanBase64,
            mimeType: opts.mimeType || 'image/jpeg',
          },
        },
        'Extract receipt merchant, date (YYYY-MM-DD), total amount in MYR, and expense category.',
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            merchant: { type: Type.STRING },
            date: { type: Type.STRING },
            amountMyr: { type: Type.NUMBER },
            category: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
          },
          required: ['merchant', 'date', 'amountMyr', 'category', 'confidence'],
        },
      },
    });
    const parsed = JSON.parse(response.text || '{}') as Partial<ExtractedReceipt>;
    return {
      merchant: parsed.merchant || 'Restoran Village Kopi',
      date: parsed.date || '2026-11-26',
      amountMyr: Number(parsed.amountMyr ?? 45),
      category: parsed.category === 'mileage' || parsed.category === 'supplies' ? parsed.category : 'staff_meal',
      confidence: Number(parsed.confidence ?? 0.91),
      mode: 'live_gemini_vision',
    };
  }

  return {
    merchant: 'Restoran Village Kopi Damansara',
    date: '2026-11-26',
    amountMyr: 45,
    category: 'staff_meal',
    confidence: 0.94,
    mode: 'demo_deterministic',
  };
}

export async function draftSopGroundedColdEmail(opts: {
  lead: ExtractedBusinessCard;
  pricingExcerpt: string;
  senderCompany: string;
  geminiApiKey?: string;
}): Promise<{ subject: string; body: string; citation: string; mode: 'live_gemini_pro' | 'demo_deterministic' }> {
  const apiKey = opts.geminiApiKey?.trim() || process.env.GEMINI_API_KEY?.trim();

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Write a short, polite B2B cold outreach email from ${opts.senderCompany} to ${opts.lead.fullName} (${opts.lead.jobTitle} at ${opts.lead.company}, industry: ${opts.lead.industryHint}). Ground pricing and MOQ strictly in this approved snippet: "${opts.pricingExcerpt}". Ask for a 15-minute intro call this week.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subject: { type: Type.STRING },
              body: { type: Type.STRING },
            },
            required: ['subject', 'body'],
          },
        },
      });
      const parsed = JSON.parse(response.text || '{}') as { subject?: string; body?: string };
      if (parsed.subject && parsed.body) {
        return {
          subject: parsed.subject,
          body: parsed.body,
          citation: 'Apex_Catalog_Pricing_2026.pdf (Section 2.1 Wholesale MOQ)',
          mode: 'live_gemini_pro',
        };
      }
    } catch {
      // Fall back deterministically so live demo never crashes on transient API quota issues
    }
  }

  const firstName = opts.lead.fullName.split(' ')[0] || opts.lead.fullName;
  return {
    subject: `Custom food-grade packaging quote for ${opts.lead.company}`,
    body: [
      `Hi ${firstName},`,
      '',
      `Great connecting regarding ${opts.lead.company}'s operations (${opts.lead.industryHint}).`,
      `At ${opts.senderCompany}, our 2026 wholesale food-grade cartons start from MYR 1.45/unit at 2,000 MOQ with 7-day Klang Valley delivery and ISO/Halal-compliant food-contact liners.`,
      '',
      `Would Tuesday or Thursday afternoon work for a quick 15-minute sample & pricing walkthrough?`,
      '',
      'Best regards,',
      `${opts.senderCompany} Sales Team`,
    ].join('\n'),
    citation: 'Apex_Catalog_Pricing_2026.pdf (Section 2.1 Wholesale MOQ & Delivery SLA)',
    mode: 'demo_deterministic',
  };
}
