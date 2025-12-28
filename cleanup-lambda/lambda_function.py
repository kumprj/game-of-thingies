import json
import boto3
from datetime import datetime, timedelta
from typing import Dict, Any

dynamodb = boto3.resource('dynamodb')
games_table = dynamodb.Table('Games')
entries_table = dynamodb.Table('Entries')
scores_table = dynamodb.Table('Scores')

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Delete Games older than 48 hours and their related Entries"""

    # Calculate cutoff time (48 hours ago)
    cutoff_time = datetime.utcnow() - timedelta(hours=48)
    cutoff_iso = cutoff_time.isoformat() + 'Z'
    print(f"Cutoff time (ISO): {cutoff_time}")
    print(f"Cutoff time for deletion: {cutoff_iso}")
    print(f"Event received: {json.dumps(event)}")

    try:
        # Scan for old games
        response = games_table.scan(
            FilterExpression='createdAt < :cutoff',
            ExpressionAttributeValues={':cutoff': cutoff_iso}
        )

        old_games = response.get('Items', [])
        print(f"Found {len(old_games)} old games to delete.")
        deleted_games = 0
        deleted_entries = 0

        # Delete each old game and its entries
        for game in old_games:
            game_id = game['gameId']
            print(f"Processing game: {game_id} created at {game['createdAt']}")

            try:
                # 1. Delete ALL entries for this gameId first
                entries_response = entries_table.scan(
                    FilterExpression='gameId = :game_id',
                    ExpressionAttributeValues={':game_id': game_id}
                )

                entries = entries_response.get('Items', [])
                print(f"Found {len(entries)} entries for game {game_id}")

                # Delete each entry
                for entry in entries:
                    entry_id = entry['entryId']
                    entries_table.delete_item(
                        Key={'gameId': game_id, 'entryId': entry_id}
                    )
                    deleted_entries += 1

                print(f"Deleted {len(entries)} entries for game {game_id} in Entries table")

                # Delete scores from Scores Table.
                scores_response = scores_table.scan(
                    FilterExpression='gameId = :game_id',
                    ExpressionAttributeValues={':game_id': game_id}
                )
                # Delete each entry
                for score in scores:
                    game_id = score['gameId']
                    scores_table.delete_item(
                        Key={'gameId': game_id}
                    )
                    deleted_entries += 1

                print(f"Deleted {len(entries)} entries for game {game_id}")

                # 2. Then delete the game itself
                games_table.delete_item(Key={'gameId': game_id})
                deleted_games += 1
                print(f"Deleted game: {game_id}")

            except Exception as e:
                print(f"Failed to delete game {game_id} or its entries: {str(e)}")

        print(f"Cleanup complete. Deleted {deleted_games} games and {deleted_entries} entries.")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Cleanup complete. Deleted {deleted_games} games and {deleted_entries} entries older than 48 hours.',
                'cutoff_time': cutoff_iso
            })
        }

    except Exception as e:
        print(f"Scan failed: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
