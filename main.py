import os
from crewai import Agent, Task, Crew, Process, LLM

os.environ["GEMINI_API_KEY"] = "AQ.Ab8RN6JeohBIkRC1Pl76T-PEzQ5_DaXTR8KAv5zuMSsAcLZEOQ"
os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]  # Ye line add karein

gemini_llm = LLM(
    model="gemini/gemini-1.5-flash", 
    api_key=os.environ["GEMINI_API_KEY"]
)

researcher = Agent(
    role='SSC PYQ Data Miner',
    goal='Extract exact Previous Year Questions for SSC CGL regarding Article 17.',
    backstory='You only pull verified SSC exam questions. You never hallucinate.',
    verbose=True,
    allow_delegation=False,
    llm=gemini_llm
)


content_director = Agent(
    role='EdTech Creative Director',
    goal='Transform PYQs into Kanthast flashcards with memory tricks.',
    backstory='You create clever Hinglish mnemonics that Indian students never forget.',
    verbose=True,
    allow_delegation=False,
    llm=gemini_llm
)

# ... (Keep your Tasks and Crew execution exactly the same below this)

# 3. TASKS
research_task = Task(
    description='Find 1 Previous Year Question from SSC CGL regarding "Article 17 (Abolition of Untouchability)". Return the Question, Options, and Correct Answer.',
    expected_output='A verified SSC CGL multiple-choice question with 4 options and the correct answer clearly indicated.',
    agent=researcher
)

creative_task = Task(
    description='Take the exact PYQ extracted by the researcher and design a Kanthast flashcard. Add a clever Hinglish memory trick (mnemonic) so students never forget the answer.',
    expected_output='A finalized study flashcard containing the original question, correct answer, and a short Hinglish memory trick.',
    agent=content_director
)

# 4. CREW EXECUTION
kanthast_crew = Crew(
    agents=[researcher, content_director],
    tasks=[research_task, creative_task],
    process=Process.sequential,
    verbose=True
)

# Start the execution
print("Starting Kanthast AI Engine...")
result = kanthast_crew.kickoff()

print("\n==========================================")
print("FINAL KANTHAST FLASHCARD:")
print("==========================================\n")
print(result)