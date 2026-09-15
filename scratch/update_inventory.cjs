const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/modules/inventory/service/inventory.service.ts');
let code = fs.readFileSync(filePath, 'utf-8');

// 1. Rewrite dispatchRequest
code = code.replace(
  /const updatedHqItem = await tx\.inventory\.update\(\{\s+where: \{ id: hqItem\.id \},\s+data: \{ stock: hqItem\.stock - qtyToDispatch \},\s+\}\);/,
  `const updatedHqCount = await tx.inventory.updateMany({
        where: { id: hqItem.id, stock: { gte: qtyToDispatch } },
        data: { stock: { decrement: qtyToDispatch } },
      });
      if (updatedHqCount.count === 0) {
        throw new ValidationError(\`Insufficient stock for \${franchiseItem.name}\`);
      }
      const updatedHqItem = await tx.inventory.findUniqueOrThrow({ where: { id: hqItem.id } });`
);

// 2. Rewrite consumeItem
code = code.replace(
  /const updated = await tx\.inventory\.update\(\{\s+where: \{ id \},\s+data: \{ stock: item\.stock - quantity \},\s+\}\);/,
  `const updatedCount = await tx.inventory.updateMany({
        where: { id, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
      });
      if (updatedCount.count === 0) {
        throw new ValidationError(\`Insufficient stock for \${item.name}\`);
      }
      const updated = await tx.inventory.findUniqueOrThrow({ where: { id } });`
);

fs.writeFileSync(filePath, code);

// Now for inventoryAdjustment.service.ts
const adjFilePath = path.join(__dirname, '../src/modules/inventory/service/inventoryAdjustment.service.ts');
let adjCode = fs.readFileSync(adjFilePath, 'utf-8');

adjCode = adjCode.replace(
  /const newStock = resolveNewStock\(item\.stock, request\.requestedQty\);\s+const updatedItem = await tx\.inventory\.update\(\{\s+where: \{ id: item\.id \},\s+data: \{ stock: newStock \},\s+\}\);/,
  `let updatedItem;
      if (request.requestedQty < 0) {
        const decrementQty = Math.abs(request.requestedQty);
        const updatedCount = await tx.inventory.updateMany({
          where: { id: item.id, stock: { gte: decrementQty } },
          data: { stock: { decrement: decrementQty } },
        });
        if (updatedCount.count === 0) throw new ValidationError("Insufficient stock for adjustment");
        updatedItem = await tx.inventory.findUniqueOrThrow({ where: { id: item.id } });
      } else {
        const updatedCount = await tx.inventory.updateMany({
          where: { id: item.id },
          data: { stock: { increment: request.requestedQty } },
        });
        updatedItem = await tx.inventory.findUniqueOrThrow({ where: { id: item.id } });
      }`
);

fs.writeFileSync(adjFilePath, adjCode);

console.log("Updated inventory services successfully");
