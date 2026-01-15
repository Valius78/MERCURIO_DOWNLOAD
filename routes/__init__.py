import pkgutil
import importlib
import inspect
from flask import Blueprint
import routes  # la cartella principale

all_blueprints = []

def find_blueprints(package):
    """
    Scansiona ricorsivamente un package e aggiunge tutti i Blueprint trovati.
    Stampa tutti gli endpoint trovati per aiutare il debug.
    """
    for loader, module_name, is_pkg in pkgutil.walk_packages(package.__path__, package.__name__ + "."):
        module = importlib.import_module(module_name)

        # Cerca tutte le variabili che sono istanze di Blueprint
        for name, obj in inspect.getmembers(module):
            if isinstance(obj, Blueprint):
                all_blueprints.append(obj)

                # Stampiamo il blueprint e i suoi endpoint per debug
                #print(f"[DEBUG] Blueprint trovato: {obj.name}")
                # for rule in obj.deferred_functions:
                #     print(f"  [DEBUG] Funzione deferred registrata in {obj.name}: {rule}")

find_blueprints(routes)
print("Blueprint registrati automaticamente:")
for bp in all_blueprints:
    print(f"- {bp.name}")


