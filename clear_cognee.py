import asyncio

async def clear_cognee_data():
    try:
        import cognee
        print("Purging all cognee data...")
        await cognee.prune.prune_system()
        print("Successfully cleared all cognee system data (databases, storage, graphs).")
    except ImportError:
        print("Error: 'cognee' is not installed in the current environment.")
        print("Please run this script in the environment where cognee is installed.")
    except Exception as e:
        print(f"An error occurred while trying to clear cognee data: {e}")
        print("\nAlternatively, you can manually delete the `.cognee_system` directory in your project root or home directory.")

if __name__ == "__main__":
    asyncio.run(clear_cognee_data())
