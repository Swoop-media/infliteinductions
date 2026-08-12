import fitz, glob
for pdf in ["attached_assets/supabase_email_1786502683200.pdf","attached_assets/high_disk_1786502688002.pdf","attached_assets/compute_1786502760226.pdf"]:
    doc = fitz.open(pdf)
    name = pdf.split("/")[-1].split("_")[0] + ("_disk" if "high_disk" in pdf else "")
    for i, page in enumerate(doc):
        pm = page.get_pixmap(matrix=fitz.Matrix(2,2))
        out = f".agents/outputs/{name}_p{i}.png"
        pm.save(out)
        print(out, doc.page_count)
