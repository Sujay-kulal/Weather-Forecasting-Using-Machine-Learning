import subprocess
import ast
import difflib
from pathlib import Path

APPROVED_SUFFIXES_COUNT = 4

def get_ast_functions(ref, filepath):
    if ref is None:
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                code = f.read()
        except Exception:
            return {}
    else:
        res = subprocess.run(['git', 'show', f'{ref}:{filepath}'], capture_output=True, text=True)
        if res.returncode != 0:
            return {}
        code = res.stdout
    tree = ast.parse(code, filename=filepath)
    
    constants = {'APPROVED_SUFFIXES': APPROVED_SUFFIXES_COUNT}
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name) and isinstance(node.value, (ast.List, ast.Tuple)):
                    constants[t.id] = len(node.value.elts)

    funcs = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name.startswith('test_'):
            decorators = [ast.unparse(d) for d in node.decorator_list]
            body_src = ast.unparse(node)
            assertions = [ast.unparse(n) for n in ast.walk(node) if isinstance(n, ast.Assert)]
            args = [a.arg for a in node.args.args]
            
            # Count cases
            param_cases = 1
            for d in node.decorator_list:
                if isinstance(d, ast.Call) and getattr(d.func, 'attr', None) == 'parametrize':
                    arg1 = d.args[1]
                    if isinstance(arg1, (ast.List, ast.Tuple)):
                        param_cases *= len(arg1.elts)
                    elif isinstance(arg1, ast.Name) and arg1.id in constants:
                        param_cases *= constants[arg1.id]

            funcs[node.name] = {
                'decorators': decorators,
                'args': args,
                'body_src': body_src,
                'assertions': assertions,
                'cases': param_cases,
            }
    return funcs

modules = [
    'backend/tests/test_admin_ingest.py',
    'backend/tests/test_ingestion_pipeline.py',
    'backend/tests/test_prediction_integrity.py',
    'backend/tests/test_migrate_db.py',
    'backend/tests/test_scheduler_lifecycle.py',
    'backend/tests/test_scheduler_demo_isolation.py',
    'backend/tests/test_evaluate_deployed_artifact.py',
    'backend/tests/test_scheduler_config.py'
]

log_path = Path(__file__).resolve().parent / 'full_ast_audit_log.txt'

with open(log_path, 'w', encoding='utf-8') as out:
    out.write('=== FULL AST COMPARISON LOG ===\n\n')
    
    for mod in modules:
        pr8 = get_ast_functions('40b8d47', mod)
        pr9 = get_ast_functions('4df2e33', mod)
        rem = get_ast_functions(None, mod) # live candidate source
        
        out.write(f'Module: {mod}\n')
        out.write(f'  Functions: PR8={len(pr8)}, PR9={len(pr9)}, Candidate={len(rem)}\n')
        
        # Check PR8 preservation
        for fname, f8 in pr8.items():
            if fname not in rem:
                out.write(f'  [FATAL] PR8 function {fname} missing in Candidate!\n')
            else:
                f_rem = rem[fname]
                if f8['body_src'] == f_rem['body_src']:
                    out.write(f'  [PR8 EXACT MATCH] {fname}\n')
                else:
                    out.write(f'  [PR8 BODY DIFF] {fname}:\n')
                    diff = difflib.unified_diff(
                        f8['body_src'].splitlines(),
                        f_rem['body_src'].splitlines(),
                        fromfile='PR8', tofile='Candidate', lineterm=''
                    )
                    out.write('\n'.join('    ' + l for l in diff) + '\n')
        
        # Check PR9 preservation
        for fname, f9 in pr9.items():
            if fname not in rem:
                out.write(f'  [FATAL] PR9 function {fname} missing in Candidate!\n')
            else:
                f_rem = rem[fname]
                if f9['body_src'] == f_rem['body_src']:
                    out.write(f'  [PR9 EXACT MATCH] {fname}\n')
                else:
                    out.write(f'  [PR9 BODY DIFF] {fname}:\n')
                    diff = difflib.unified_diff(
                        f9['body_src'].splitlines(),
                        f_rem['body_src'].splitlines(),
                        fromfile='PR9', tofile='Candidate', lineterm=''
                    )
                    out.write('\n'.join('    ' + l for l in diff) + '\n')
        
        # Check added functions in Candidate
        added = set(rem.keys()) - (set(pr8.keys()) | set(pr9.keys()))
        for fname in added:
            c_count = rem[fname]['cases']
            out.write(f'  [NEW REGRESSION TEST] {fname} ({c_count} cases)\n')
        out.write('\n')

print(f'Comparison complete. Output written to {log_path}')
