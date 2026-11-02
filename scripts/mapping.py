def mapping(dimension=384):
    vector = {"type": "dense_vector", "dims": dimension, "index": True, "similarity": "cosine",
              "index_options": {"type": "hnsw", "m": 16, "ef_construction": 100}}
    return {
        "settings": {"number_of_shards": 1, "number_of_replicas": 0,
                     "analysis": {
                         "filter": {"identifier": {"type": "word_delimiter_graph", "preserve_original": True, "catenate_all": True},
                                    "prefix": {"type": "edge_ngram", "min_gram": 2, "max_gram": 20}},
                         "analyzer": {
                             "identifier": {"tokenizer": "whitespace", "filter": ["identifier", "lowercase", "flatten_graph"]},
                             "prefix": {"tokenizer": "standard", "filter": ["lowercase", "prefix"]}}}},
        "mappings": {"dynamic": "strict", "properties": {
            "id": {"type": "keyword"}, "fullName": {"type": "keyword"},
            "name": {"type": "text", "analyzer": "identifier", "search_analyzer": "identifier",
                     "fields": {"prefix": {"type": "text", "analyzer": "prefix", "search_analyzer": "standard"}}},
            "description": {"type": "text"}, "url": {"type": "keyword", "index": False},
            "language": {"type": "keyword", "normalizer": "lowercase"},
            "stars": {"type": "long"}, "pushedAt": {"type": "date"}, "topics": {"type": "keyword"},
            "model": {"type": "keyword"}, "modelRevision": {"type": "keyword"},
            "contentHash": {"type": "keyword"}, "embedding": vector,
            "chunks": {"type": "nested", "properties": {"heading": {"type": "text"},
                       "body": {"type": "text"}, "embedding": vector}},
        }}
    }
