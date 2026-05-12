function assertIdentifier(value, kind) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid ${kind}: ${value}`);
  }
  return `\`${value}\``;
}

function buildBatchInsert(table, columns, rows) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error('columns must be a non-empty array');
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('rows must be a non-empty array');
  }

  const quotedTable = assertIdentifier(table, 'table name');
  const quotedColumns = columns.map((column) => assertIdentifier(column, 'column name'));
  const rowPlaceholder = `(${columns.map(() => '?').join(', ')})`;

  const params = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== columns.length) {
      throw new Error('each row must be an array matching columns length');
    }
    params.push(...row);
  }

  const sql = `INSERT INTO ${quotedTable} (${quotedColumns.join(', ')}) VALUES ${rows.map(() => rowPlaceholder).join(', ')}`;
  return { sql, params };
}

module.exports = { buildBatchInsert };
