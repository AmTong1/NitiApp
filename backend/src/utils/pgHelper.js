/**
 * PostgreSQL Query Helper
 * แปลง MySQL-style placeholders (?) เป็น PostgreSQL-style ($1, $2, ...)
 */

/**
 * แปลง query string จาก MySQL (?) เป็น PostgreSQL ($1, $2, ...)
 * @param {string} sql - MySQL query string
 * @returns {string} PostgreSQL query string
 */
function convertPlaceholders(sql) {
  let counter = 0;
  return sql.replace(/\?/g, () => `$${++counter}`);
}

/**
 * Helper สำหรับ batch insert (แปลงจาก MySQL VALUES ? เป็น PostgreSQL)
 * @param {string} tableName - ชื่อตาราง
 * @param {string[]} columns - รายชื่อคอลัมน์
 * @param {any[][]} rows - array of value arrays
 * @returns {{ sql: string, params: any[] }}
 */
function buildBatchInsert(tableName, columns, rows) {
  if (!rows.length) return { sql: '', params: [] };
  
  const params = [];
  const valueParts = [];
  let paramIndex = 1;
  
  for (const row of rows) {
    const placeholders = row.map((val) => {
      params.push(val);
      return `$${paramIndex++}`;
    });
    valueParts.push(`(${placeholders.join(', ')})`);
  }
  
  const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${valueParts.join(', ')}`;
  return { sql, params };
}

/**
 * Helper สำหรับ UPSERT (ON CONFLICT)
 * @param {string} tableName
 * @param {string[]} columns
 * @param {any[]} values
 * @param {string} conflictColumn
 * @param {string[]} updateColumns
 * @returns {{ sql: string, params: any[] }}
 */
function buildUpsert(tableName, columns, values, conflictColumn, updateColumns) {
  const placeholders = values.map((_, i) => `$${i + 1}`);
  const updates = updateColumns.map((col, i) => `${col} = $${columns.indexOf(col) + 1}`);
  
  const sql = `
    INSERT INTO ${tableName} (${columns.join(', ')})
    VALUES (${placeholders.join(', ')})
    ON CONFLICT (${conflictColumn})
    DO UPDATE SET ${updates.join(', ')}
  `;
  
  return { sql, params: values };
}

module.exports = {
  convertPlaceholders,
  buildBatchInsert,
  buildUpsert,
};
