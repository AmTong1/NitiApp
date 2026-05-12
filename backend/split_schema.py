import re

sql_content = open('schema.sql', 'r', encoding='utf-8').read()

# Separate by double newlines or identify CREATE TABLE blocks
blocks = re.split(r'(?i)\n\s*CREATE TABLE', '\n' + sql_content)
# blocks[0] is header comments
tables_sql = {}
for block in blocks[1:]:
    block = 'CREATE TABLE' + block
    match = re.search(r'CREATE TABLE\s+(?:IF NOT EXISTS\s+)?`?(\w+)`?', block, re.IGNORECASE)
    if match:
        table_name = match.group(1)
        tables_sql[table_name] = block.strip() + '\n'

zones = {
    'Center_Core': ['accounts', 'system_settings', 'contacts', 'announcements', 'announcement_logs'],
    'ZoneA_Residents': ['houses', 'residents', 'resident_logs'],
    'ZoneB_Finance': ['users', 'payments', 'payment_installments', 'payment_intents', 'slipok_verifications'],
    'ZoneC_Chat': ['chat_rooms', 'chat_members', 'chat_messages', 'chat_room_reads', 'chat_room_pins', 'chat_room_admin_pins', 'chat_message_pins', 'chat_reactions'],
    'ZoneD_Repair': ['repairs', 'repair_photos', 'repair_edit_logs']
}

for zone_name, table_list in zones.items():
    with open(f'schema_{zone_name}.sql', 'w', encoding='utf-8') as f:
        f.write(f"-- Schema for {zone_name}\n\n")
        # We need to preserve the order or handle dependencies if possible, but for just splitting, we'll output in the order provided in the list
        for t in table_list:
            if t in tables_sql:
                f.write(tables_sql[t] + '\n')

print("SQL files separated by zone successfully.")
