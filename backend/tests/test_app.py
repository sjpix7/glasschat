import json
import sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessageChunk, HumanMessage, AIMessage
import app as module

client = TestClient(module.app)

def payload(**changes):
    return dict(provider='openai', model='test-model', api_key='test-secret',
                messages=[{'role':'user','content':'Hello'}], **changes)

def test_health():
    assert client.get('/api/health').json() == {'status':'ok'}

def test_invalid_request_does_not_echo_secrets():
    data=payload(); data['provider']='unknown'
    result=client.post('/api/chat',json=data)
    assert result.status_code == 422
    assert 'test-secret' not in result.text

def test_requires_cloud_key():
    data=payload(); data['api_key']=''
    assert client.post('/api/chat',json=data).status_code == 422

def test_ollama_url_validation():
    for url in ['http://169.254.169.254', 'file:///etc/passwd', 'http://localhost:11434/api/chat', 'http://user:password@localhost:11434']:
        data=payload();data.update(provider='ollama',base_url=url,api_key='')
        assert client.post('/api/chat',json=data).status_code == 422
    data.update(base_url='http://host.docker.internal:11434')
    assert module.ChatRequest(**data).provider=='ollama'

def test_stream_and_history():
    captured=[]
    class Fake:
        async def astream(self,messages):
            captured.extend(messages)
            yield AIMessageChunk(content='Hello ')
            yield AIMessageChunk(content=[{'type':'text','text':'world'},{'type':'thinking','thinking':'hidden'}])
    data=payload();data['messages']=[{'role':'user','content':'Hi'},{'role':'assistant','content':'Hey'},{'role':'user','content':'Again'}]
    with patch.object(module,'build_model',return_value=Fake()):
        response=client.post('/api/chat',json=data)
    events=[json.loads(line) for line in response.text.splitlines()]
    assert events==[{'type':'token','text':'Hello '},{'type':'token','text':'world'},{'type':'done'}]
    assert isinstance(captured[1],HumanMessage) and isinstance(captured[2],AIMessage)
    assert response.headers['cache-control']=='no-store'

def test_provider_error_is_sanitized():
    with patch.object(module,'build_model',side_effect=Exception('test-secret')):
        response=client.post('/api/chat',json=payload())
    assert 'test-secret' not in response.text
    assert json.loads(response.text)['type']=='error'

def test_provider_constructors():
    for provider,constructor in [('openai','ChatOpenAI'),('anthropic','ChatAnthropic'),('google','ChatGoogleGenerativeAI'),('ollama','ChatOllama')]:
        data=payload();data['provider']=provider
        with patch.object(module,constructor) as factory:
            module.build_model(module.ChatRequest(**data))
            assert factory.call_args.kwargs['model']=='test-model'
            if provider!='ollama': assert factory.call_args.kwargs['api_key']=='test-secret'

def test_real_adapters_construct_without_network():
    for provider in ['openai','anthropic','google','ollama']:
        data=payload();data['provider']=provider
        assert hasattr(module.build_model(module.ChatRequest(**data)), 'astream')
