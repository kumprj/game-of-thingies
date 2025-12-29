import json
import boto3
from datetime import datetime, timedelta
from typing import Dict, Any
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
games_table = dynamodb.Table('Games')
entries_table = dynamodb.Table('Entries')
scores_table = dynamodb.Table('Scores')

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Delete Games older than X hours and their related Entries/Scores"""

    # 24 hours ago
    cutoff_time = datetime.utcnow() - timedelta(hours=24)
    cutoff_iso = cutoff_time.isoformat() + 'Z'
    print(f"Cutoff time (ISO): {cutoff_iso}")

    try:
        # 1. Scan for old games (Scanning Games table is unavoidable if you don't have a GSI on createdAt)
        # However, for cleanup jobs, a scan is usually acceptable.
        response = games_table.scan(
            FilterExpression='createdAt < :cutoff',
            ExpressionAttributeValues={':cutoff': cutoff_iso},
            ProjectionExpression='gameId, createdAt' # Only fetch what we need
        )

        old_games = response.get('Items', [])
        print(f"Found {len(old_games)} old games to delete.")

        deleted_games = 0
        deleted_items_count = 0

        for game in old_games:
            game_id = game['gameId']
            print(f"Processing game: {game_id} (Created: {game['createdAt']})")

            try:
                # --- DELETE ENTRIES (Batch) ---
                # Use QUERY, not Scan, since we have the partition key (gameId)
                entries_response = entries_table.query(
                    KeyConditionExpression=Key('gameId').eq(game_id)
                )
                entries = entries_response.get('Items', [])

                if entries:
                    with entries_table.batch_writer() as batch:
                        for entry in entries:
                            # Batch delete requires the full Primary Key (Partition + Sort)
                            # Assuming 'entryId' is the sort key. If table only has gameId, adjust.
                            batch.delete_item(Key={
                                'gameId': game_id,
                                'entryId': entry['entryId']
                            })
                            deleted_items_count += 1
                    print(f"Deleted {len(entries)} entries for game {game_id}")


                # --- DELETE SCORES (Batch) ---
                scores_response = scores_table.query(
                    KeyConditionExpression=Key('gameId').eq(game_id)
                )
                scores = scores_response.get('Items', [])

                if scores:
                    with scores_table.batch_writer() as batch:
                        for score in scores:
                            # Assuming 'playerName' is the sort key based on your previous code
                            # If your score table schema is different, update the Key below.
                            batch.delete_item(Key={
                                'gameId': game_id,
                                'playerName': score['playerName']
                            })
                            deleted_items_count += 1
                    print(f"Deleted {len(scores)} scores for game {game_id}")


                # --- DELETE GAME ---
                games_table.delete_item(Key={'gameId': game_id})
                deleted_games += 1
                print(f"Deleted game: {game_id}")

            except Exception as e:
                print(f"ERROR processing game {game_id}: {str(e)}")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Cleanup successful',
                'deleted_games': deleted_games,
                'deleted_items': deleted_items_count
            })
        }

    except Exception as e:
        print(f"Fatal error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
