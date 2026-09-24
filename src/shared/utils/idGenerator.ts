import { db } from '../../lib/db.js';

const getMaxExistingId = async (prefix: string, prisma: any): Promise<number> => {
  const modelMap: Record<string, any> = {
    CUS: prisma.customer,
    CUST: prisma.customer,
    JOB: prisma.job,
    L: prisma.lead,
    INV: prisma.invoice,
    OP: prisma.outPass,
  };
  const model = modelMap[prefix];
  let maxId = 0;
  if (model) {
    const records = await model.findMany({
      where: { id: { startsWith: prefix } },
      select: { id: true },
      take: 5000
    });
    for (const r of records) {
      const num = parseInt(r.id.replace(/^[A-Za-z]+[-_]?/, ""), 10);
      if (!isNaN(num) && num > maxId) maxId = num;
    }
  }
  return maxId;
};

/**
 * Database-backed atomic sequential ID generator across multiple backend process instances.
 * Uses atomic upsert on JobSequence table with PostgreSQL row-level counter increment.
 */
export const generateSequentialId = async (prefix: string, tx?: any): Promise<string> => {
  const prisma = tx || db;

  if ((prisma as any).jobSequence) {
    const existingSeq = await (prisma as any).jobSequence.findUnique({ where: { prefix } });
    if (!existingSeq) {
      const maxId = await getMaxExistingId(prefix, prisma);
      await (prisma as any).jobSequence.create({
        data: { prefix, counter: maxId }
      }).catch(() => {});
    }
  }

  let attempts = 0;
  while (attempts < 10) {
    attempts++;
    try {
      if ((prisma as any).jobSequence) {
        const seq = await (prisma as any).jobSequence.upsert({
          where: { prefix },
          update: { counter: { increment: 1 } },
          create: { prefix, counter: 1 }
        });
        return `${prefix}-${String(seq.counter).padStart(5, "0")}`;
      }
    } catch (err: any) {
      if (attempts >= 10) {
        const maxId = await getMaxExistingId(prefix, prisma);
        return `${prefix}-${String(maxId + attempts).padStart(5, "0")}`;
      }
      await new Promise((r) => setTimeout(r, 5 + Math.floor(Math.random() * 15)));
    }
  }

  const maxId = await getMaxExistingId(prefix, prisma);
  return `${prefix}-${String(maxId + 1).padStart(5, "0")}`;
};


export const generateUid = (prefix: string) => `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

