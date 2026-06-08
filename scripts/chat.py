from langchain_ollama import ChatOllama # this library is used to connect to the local Ollama model
from langchain_core.messages import HumanMessage # this library is used to send a message to the model

# Point to your local Ollama model
llm = ChatOllama(model="llama3.1:8b") # this is the model we are using

# Send a message and get a response
response = llm.invoke([HumanMessage(content="What is astrophysics?")]) # this is the message we are sending to the model

print(response.content) # this is the response from the model
