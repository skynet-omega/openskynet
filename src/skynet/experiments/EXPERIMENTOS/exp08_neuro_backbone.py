
import sys
import os
import networkx as nx
import matplotlib.pyplot as plt

# Adjust path to find lib
# Adjust path to find lib
sys.path.append(os.path.join(os.path.dirname(__file__), '../tests/tensor_lenia/lib'))

from hypergraph import SimpleWolframSystem
from curvature import calculate_forman_ricci

def run_visual_neuro(steps=9): 
    output_path = "/home/daroch/SOLITONES/EXPERIMENTOS/"
    log_file = output_path + "exp08_neuro_backbone.log"
    
    with open(log_file, "w") as f:
        f.write("--- LEGACY EXP 05: NEURO BACKBONE ---\n")

    print("Generating Hyperbolic Backbone Visual Demo...")
    with open(log_file, "a") as f: f.write("Generating Hyperbolic Backbone Visual Demo...\n")
    
    # 1. Substrate
    system = SimpleWolframSystem()
    system.initialize([[1, 2], [1, 3]])
    for i in range(steps):
        system.step()
        
    msg = f"Graph Generated."
    print(msg)
    with open(log_file, "a") as f: f.write(msg + "\n")
    
    # 2. Curvature
    curvatures = calculate_forman_ricci(system)
    
    # 3. Build Graph
    G = nx.Graph()
    for e in system.edges:
        if len(e) >= 2: G.add_edge(e[0], e[1])
        
    # 4. Identify Backbone
    # Color nodes by Curvature:
    #   Red (Dark) = Very Negative (Hyperbolic Backbone)
    #   Blue (Light) = Near Zero (Flat)
    
    node_colors = []
    backbone_nodes = []
    nodes = list(G.nodes())
    
    for n in nodes:
        r = curvatures.get(n, 0)
        node_colors.append(r)
        if r < -3.0:
            backbone_nodes.append(n)
            
    # 5. Routing Demo
    # Find a path between two backbone nodes that are far apart
    path_nodes = []
    if len(backbone_nodes) > 2:
        try:
            start = backbone_nodes[0]
            end = backbone_nodes[-1]
            if nx.has_path(G, start, end):
                path_nodes = nx.shortest_path(G, start, end)
        except:
            pass
            
    # 6. Render
    print("Rendering...")
    pos = nx.spring_layout(G, seed=42)
    
    plt.figure(figsize=(10, 10))
    
    # Draw all nodes colored by curvature
    nx.draw_networkx_nodes(G, pos, node_size=30, 
                           node_color=node_colors, cmap='Reds_r', vmin=-8, vmax=0)
                           
    # Draw all edges faint
    nx.draw_networkx_edges(G, pos, alpha=0.1, edge_color='gray')
    
    # Highlight Backbone Edges (edges connecting two backbone nodes)
    backbone_edges = []
    for u, v in G.edges():
        if u in backbone_nodes and v in backbone_nodes:
            backbone_edges.append((u, v))
            
    nx.draw_networkx_edges(G, pos, edgelist=backbone_edges, 
                           width=2.0, alpha=0.6, edge_color='red')
                           
    # Highlight Path
    if path_nodes:
        path_edges = list(zip(path_nodes, path_nodes[1:]))
        nx.draw_networkx_edges(G, pos, edgelist=path_edges,
                               width=3.0, edge_color='cyan')
                               
    plt.title("Neuromorphic Architecture: \nRed = Hyperbolic Backbone (R < -3), Cyan = Optimal Data Path")
    plt.axis('off')
    
    plt.tight_layout()
    save_file = output_path + 'exp08_neuro_backbone.png'
    plt.savefig(save_file, dpi=150)
    print(f"Saved {save_file}")
    with open(log_file, "a") as f: f.write(f"Saved {save_file}\n")

if __name__ == "__main__":
    run_visual_neuro()
