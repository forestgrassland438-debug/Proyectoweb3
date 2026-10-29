from pathlib import Path
p=Path('C:/Users/pc/Desktop/server2.js');s=p.read_text(encoding='utf8')
a="const tesoroMovSchema = new mongoose.Schema({\n  ref: { type: String },"
assert a in s;s=s.replace(a,"const tesoroMovSchema = new mongoose.Schema({")
a="tesoroMovSchema.index({ tipo: 1, t: -1 });\ntesoroMovSchema.index({ ref: 1 }, { unique: true, sparse: true });"
assert a in s;s=s.replace(a,"tesoroMovSchema.index({ tipo: 1, t: -1 });")
a="  if (oro * 1000000 + plata * 1000 + bronce < falta) return null;"
assert a in s;s=s.replace(a,"  const total = oro * 1000000 + plata * 1000 + bronce;\n  if (!Number.isSafeInteger(total) || total < falta) return null;")
p.write_text(s,encoding='utf8',newline='\r\n')
